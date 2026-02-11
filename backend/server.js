/**
 * NetGuard Backend API Server
 * 
 * Proxy-server for å koble frontend til:
 * - UniFi Controller
 * - TrueNAS
 * - Proxmox VE
 * - OpenVAS
 */

const dotenvPath = require('path').join(__dirname, '.env');
const dotenvResult = require('dotenv').config({ path: dotenvPath });
if (dotenvResult.error) {
  console.warn('[dotenv] Kunne ikke laste .env frå', dotenvPath, ':', dotenvResult.error.message);
} else {
  console.log('[dotenv] Lastet .env frå', dotenvPath, 'med', Object.keys(dotenvResult.parsed || {}).length, 'variabler');
}
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3001;

// Data directory for persistent storage
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// JWT secret - generate random if not set
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(64).toString('hex');

// Middleware
app.use(cors());
app.use(express.json());

// Ignorer self-signed SSL sertifikater (for UniFi, Proxmox etc.)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ============================================
// Authentication & User Management
// ============================================

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Feil ved lasting av brukere:', error.message);
  }
  return [];
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Feil ved lasting av konfig:', error.message);
  }
  return { setupCompleted: false };
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Ingen tilgangstoken' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Ugyldig eller utløpt token' });
    }
    req.user = user;
    next();
  });
}

// Check if setup is required
app.get('/api/auth/setup-status', (req, res) => {
  const config = loadConfig();
  const users = loadUsers();
  res.json({ 
    setupRequired: !config.setupCompleted || users.length === 0 
  });
});

// Initial setup endpoint
app.post('/api/auth/setup', async (req, res) => {
  try {
    const config = loadConfig();
    const users = loadUsers();
    
    // Only allow setup if not already completed
    if (config.setupCompleted && users.length > 0) {
      return res.status(400).json({ error: 'Oppsett er allerede fullført' });
    }
    
    const { admin, services } = req.body;
    
    if (!admin?.username || !admin?.password) {
      return res.status(400).json({ error: 'Brukernavn og passord er påkrevd' });
    }
    
    if (admin.password.length < 8) {
      return res.status(400).json({ error: 'Passord må være minst 8 tegn' });
    }
    
    // Hash password and create admin user
    const hashedPassword = await bcrypt.hash(admin.password, 12);
    const adminUser = {
      id: require('crypto').randomUUID(),
      username: admin.username,
      password: hashedPassword,
      role: 'admin',
      createdAt: new Date().toISOString(),
    };
    
    saveUsers([adminUser]);
    
    // Update .env file with service configurations
    const envPath = path.join(__dirname, '.env');
    let envContent = [];
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8').split('\n');
    }
    
    const updateEnv = (key, value) => {
      if (!value) return;
      // Set in process.env immediately
      process.env[key] = value;
      // Also write to .env file
      const index = envContent.findIndex(line => line.startsWith(`${key}=`));
      if (index >= 0) {
        envContent[index] = `${key}=${value}`;
      } else {
        envContent.push(`${key}=${value}`);
      }
    };
    
    if (services?.unifi) {
      updateEnv('UNIFI_CONTROLLER_URL', services.unifi.url);
      updateEnv('UNIFI_API_KEY', services.unifi.apiKey);
      updateEnv('UNIFI_USERNAME', services.unifi.username);
      updateEnv('UNIFI_PASSWORD', services.unifi.password);
      updateEnv('UNIFI_SITE', services.unifi.site || 'default');
    }
    
    if (services?.truenas) {
      updateEnv('TRUENAS_URL', services.truenas.url);
      updateEnv('TRUENAS_API_KEY', services.truenas.apiKey);
    }
    
    if (services?.proxmox) {
      updateEnv('PROXMOX_URL', services.proxmox.url);
      updateEnv('PROXMOX_USER', services.proxmox.user);
      updateEnv('PROXMOX_TOKEN_ID', services.proxmox.tokenId);
      updateEnv('PROXMOX_TOKEN_SECRET', services.proxmox.tokenSecret);
    }
    
    if (services?.openvas) {
      updateEnv('OPENVAS_URL', services.openvas.url);
      updateEnv('OPENVAS_USERNAME', services.openvas.username);
      updateEnv('OPENVAS_PASSWORD', services.openvas.password);
    }
    
    fs.writeFileSync(envPath, envContent.join('\n'));
    
    // Mark setup as completed
    saveConfig({ setupCompleted: true, setupDate: new Date().toISOString() });
    
    // Reload environment variables
    require('dotenv').config();
    
    res.json({ success: true, message: 'Oppsett fullført' });
  } catch (error) {
    console.error('Setup feilet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Brukernavn og passord er påkrevd' });
    }
    
    const users = loadUsers();
    const user = users.find(u => u.username === username);
    
    if (!user) {
      return res.status(401).json({ error: 'Ugyldig brukernavn eller passord' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Ugyldig brukernavn eller passord' });
    }
    
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login feilet:', error);
    res.status(500).json({ error: 'Innlogging feilet' });
  }
});

// Validate token endpoint
app.get('/api/auth/validate', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// Get all users (admin only)
app.get('/api/auth/users', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Kun administratorer har tilgang' });
  }
  
  const users = loadUsers().map(u => ({
    id: u.id,
    username: u.username,
    role: u.role,
    createdAt: u.createdAt,
  }));
  
  res.json({ users });
});

// Create new user (admin only)
app.post('/api/auth/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Kun administratorer har tilgang' });
  }
  
  try {
    const { username, password, role = 'user' } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Brukernavn og passord er påkrevd' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'Passord må være minst 8 tegn' });
    }
    
    const users = loadUsers();
    
    if (users.some(u => u.username === username)) {
      return res.status(400).json({ error: 'Brukernavn er allerede i bruk' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = {
      id: require('crypto').randomUUID(),
      username,
      password: hashedPassword,
      role: role === 'admin' ? 'admin' : 'user',
      createdAt: new Date().toISOString(),
    };
    
    users.push(newUser);
    saveUsers(users);
    
    res.json({
      user: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user (admin only)
app.delete('/api/auth/users/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Kun administratorer har tilgang' });
  }
  
  const { id } = req.params;
  
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Du kan ikke slette din egen konto' });
  }
  
  let users = loadUsers();
  users = users.filter(u => u.id !== id);
  saveUsers(users);
  
  res.json({ success: true });
});

// Change password
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Begge passord er påkrevd' });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Nytt passord må være minst 8 tegn' });
    }
    
    const users = loadUsers();
    const user = users.find(u => u.id === req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'Bruker ikke funnet' });
    }
    
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Nåværende passord er feil' });
    }
    
    user.password = await bcrypt.hash(newPassword, 12);
    saveUsers(users);
    
    res.json({ success: true, message: 'Passord endret' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user (admin only) - change role and/or reset password
app.patch('/api/auth/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Kun administratorer har tilgang' });
  }

  try {
    const { id } = req.params;
    const { role, newPassword } = req.body;

    const users = loadUsers();
    const user = users.find(u => u.id === id);

    if (!user) {
      return res.status(404).json({ error: 'Bruker ikke funnet' });
    }

    if (role && ['admin', 'user'].includes(role)) {
      user.role = role;
    }

    if (newPassword) {
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Passord må være minst 8 tegn' });
      }
      user.password = await bcrypt.hash(newPassword, 12);
    }

    saveUsers(users);
    res.json({ success: true, message: 'Bruker oppdatert', user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Service Configuration Management
// ============================================

// Get current service configuration (admin only)
app.get('/api/config/services', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Kun administratorer har tilgang' });
  }
  
  res.json({
    unifi: {
      url: process.env.UNIFI_CONTROLLER_URL || '',
      apiKey: process.env.UNIFI_API_KEY ? '••••••••' : '',
      username: process.env.UNIFI_USERNAME || '',
      password: process.env.UNIFI_PASSWORD ? '••••••••' : '',
      site: process.env.UNIFI_SITE || 'default',
    },
    truenas: {
      url: process.env.TRUENAS_URL || '',
      apiKey: process.env.TRUENAS_API_KEY ? '••••••••' : '',
    },
    proxmox: {
      url: process.env.PROXMOX_URL || '',
      user: process.env.PROXMOX_USER || 'root@pam',
      tokenId: process.env.PROXMOX_TOKEN_ID || '',
      tokenSecret: process.env.PROXMOX_TOKEN_SECRET ? '••••••••' : '',
    },
    openvas: {
      url: process.env.OPENVAS_URL || '',
      username: process.env.OPENVAS_USERNAME || 'admin',
      password: process.env.OPENVAS_PASSWORD ? '••••••••' : '',
    },
    abuseipdb: {
      apiKey: process.env.ABUSEIPDB_API_KEY ? '••••••••' : '',
    },
  });
});

// Update service configuration (admin only)
app.post('/api/config/services', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Kun administratorer har tilgang' });
  }
  
  try {
    const { service, config } = req.body;
    
    if (!service || !config) {
      return res.status(400).json({ error: 'Tjeneste og konfigurasjon er påkrevd' });
    }
    
    const envPath = path.join(__dirname, '.env');
    let envContent = [];
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8').split('\n');
    }
    
    const updateEnv = (key, value) => {
      if (value === undefined || value === '••••••••') return;
      const index = envContent.findIndex(line => line.startsWith(`${key}=`));
      if (index >= 0) {
        envContent[index] = `${key}=${value}`;
      } else {
        envContent.push(`${key}=${value}`);
      }
      process.env[key] = value;
    };
    
    switch (service) {
      case 'unifi':
        updateEnv('UNIFI_CONTROLLER_URL', config.url);
        updateEnv('UNIFI_API_KEY', config.apiKey);
        updateEnv('UNIFI_USERNAME', config.username);
        updateEnv('UNIFI_PASSWORD', config.password);
        updateEnv('UNIFI_SITE', config.site);
        // Reset cookie when config changes
        unifiCookie = null;
        break;
      case 'truenas':
        updateEnv('TRUENAS_URL', config.url);
        updateEnv('TRUENAS_API_KEY', config.apiKey);
        break;
      case 'proxmox':
        updateEnv('PROXMOX_URL', config.url);
        updateEnv('PROXMOX_USER', config.user);
        // Strip user prefix if user accidentally includes it (e.g. "root@pam!test" -> "test")
        let tokenId = config.tokenId || '';
        if (tokenId.includes('!')) {
          tokenId = tokenId.split('!').pop();
        }
        updateEnv('PROXMOX_TOKEN_ID', tokenId);
        updateEnv('PROXMOX_TOKEN_SECRET', config.tokenSecret);
        break;
      case 'openvas':
        updateEnv('OPENVAS_URL', config.url);
        updateEnv('OPENVAS_USERNAME', config.username);
        updateEnv('OPENVAS_PASSWORD', config.password);
        break;
      case 'abuseipdb':
        updateEnv('ABUSEIPDB_API_KEY', config.apiKey);
        break;
      default:
        return res.status(400).json({ error: `Ukjent tjeneste: ${service}` });
    }
    
    fs.writeFileSync(envPath, envContent.join('\n'));
    
    res.json({ success: true, message: `${service} konfigurasjon oppdatert` });
  } catch (error) {
    console.error('Konfig-oppdatering feilet:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// UniFi Controller API
// ============================================

let unifiCookie = null;
let unifiSiteId = null; // Cached discovered site ID

// Determine auth method: API key (preferred) or legacy username/password
function getUnifiAuthMethod() {
  if (process.env.UNIFI_API_KEY) return 'apikey';
  if (process.env.UNIFI_USERNAME && process.env.UNIFI_PASSWORD) return 'legacy';
  return null;
}

// Auto-discover the correct site ID from UniFi
async function discoverUnifiSiteId() {
  if (unifiSiteId) return unifiSiteId;
  
  const baseUrl = process.env.UNIFI_CONTROLLER_URL;
  const apiKey = process.env.UNIFI_API_KEY;
  
  if (!baseUrl || !apiKey) return 'default';
  
  // Try to list sites to find the correct site ID
  const sitePaths = [
    `${baseUrl}/proxy/network/api/self/sites`,
    `${baseUrl}/api/self/sites`,
  ];
  
  for (const url of sitePaths) {
    try {
      const response = await axios.get(url, {
        httpsAgent,
        headers: { 'X-API-Key': apiKey },
        timeout: 10000,
      });
      
      const sites = response.data?.data || [];
      console.log(`[UniFi] Oppdaget ${sites.length} site(s):`, sites.map(s => `${s.name} (desc: ${s.desc})`).join(', '));
      
      if (sites.length > 0) {
        // Use first site, or match by description
        const configuredSite = process.env.UNIFI_SITE || 'default';
        const match = sites.find(s => s.desc === configuredSite || s.name === configuredSite) || sites[0];
        unifiSiteId = match.name; // API uses the 'name' field (e.g. 'default'), not 'desc'
        console.log(`[UniFi] Bruker site: "${unifiSiteId}" (desc: "${match.desc}")`);
        return unifiSiteId;
      }
    } catch (error) {
      console.log(`[UniFi] Site discovery feilet på ${url}: ${error.response?.status || error.message}`);
    }
  }
  
  console.log('[UniFi] Kunne ikke oppdage sites, bruker "default"');
  unifiSiteId = 'default';
  return unifiSiteId;
}

async function unifiRequest(endpoint) {
  const authMethod = getUnifiAuthMethod();
  
  if (!authMethod) {
    throw new Error('UniFi er ikke konfigurert. Legg til API-nøkkel eller brukernavn/passord i Innstillinger.');
  }

  const baseUrl = process.env.UNIFI_CONTROLLER_URL;

  if (authMethod === 'apikey') {
    // Auto-discover site ID first
    const site = await discoverUnifiSiteId();
    
    console.log(`[UniFi] Request: ${endpoint} (site: ${site})`);

    // Try endpoint paths in order
    const paths = [
      `${baseUrl}/proxy/network/api/s/${site}${endpoint}`,
      `${baseUrl}/api/s/${site}${endpoint}`,
    ];

    let lastError = null;
    for (const url of paths) {
      try {
        console.log(`[UniFi] Trying: ${url}`);
        const response = await axios.get(url, {
          httpsAgent,
          headers: { 'X-API-Key': process.env.UNIFI_API_KEY },
          timeout: 10000,
        });
        console.log(`[UniFi] OK: ${url} -> ${response.status}`);
        return response.data;
      } catch (error) {
        lastError = error;
        console.log(`[UniFi] Feil: ${url} -> ${error.response?.status || error.code || error.message}`);
        if (error.response?.status !== 401 && error.response?.status !== 404) {
          throw new Error(`UniFi API feil (${error.response?.status || 'network'}): ${error.message}`);
        }
      }
    }
    // Reset cached site ID on failure so next request retries discovery
    unifiSiteId = null;
    throw new Error(`UniFi: Alle API-stier feilet for ${endpoint}. Siste feil: ${lastError?.response?.status || lastError?.message}.`);
  }

  // Legacy cookie-based auth — should never be reached if API key is set
  if (process.env.UNIFI_API_KEY) {
    console.error('[UniFi] BUG: Legacy auth path nådd trass i at API-nøkkel er satt. authMethod var:', authMethod);
    throw new Error('UniFi: API-nøkkel er satt men API-stier feilet. Sjekk at nøkkelen er gyldig.');
  }
  if (!process.env.UNIFI_USERNAME || !process.env.UNIFI_PASSWORD) {
    throw new Error('UniFi: Brukernavn/passord er ikke satt. Bruk API-nøkkel i stedet.');
  }
  
  const legacySite = process.env.UNIFI_SITE || 'default';
  
  if (!unifiCookie) {
    try {
      const loginRes = await axios.post(
        `${baseUrl}/api/login`,
        { username: process.env.UNIFI_USERNAME, password: process.env.UNIFI_PASSWORD },
        { httpsAgent, withCredentials: true }
      );
      unifiCookie = loginRes.headers['set-cookie'];
    } catch (error) {
      console.error('[UniFi] Login feilet:', error.message);
      throw new Error('UniFi login feilet. Sjekk brukernavn/passord eller bruk API-nøkkel.');
    }
  }
  
  try {
    const response = await axios.get(
      `${baseUrl}/api/s/${legacySite}${endpoint}`,
      { httpsAgent, headers: { Cookie: unifiCookie?.join('; ') } }
    );
    return response.data;
  } catch (error) {
    if (error.response?.status === 401) {
      unifiCookie = null; // Reset and retry
      try {
        const loginRes = await axios.post(
          `${baseUrl}/api/login`,
          { username: process.env.UNIFI_USERNAME, password: process.env.UNIFI_PASSWORD },
          { httpsAgent, withCredentials: true }
        );
        unifiCookie = loginRes.headers['set-cookie'];
        const retry = await axios.get(
          `${baseUrl}/api/s/${legacySite}${endpoint}`,
          { httpsAgent, headers: { Cookie: unifiCookie?.join('; ') } }
        );
        return retry.data;
      } catch (retryErr) {
        throw new Error('UniFi: Re-login feilet. Sjekk credentials.');
      }
    }
    throw error;
  }
}

// UniFi endepunkter
app.get('/api/unifi/alerts', authenticateToken, async (req, res) => {
  try {
    const data = await unifiRequest('/stat/ips/event');
    console.log('[UniFi] alerts keys:', data ? Object.keys(data) : 'null', 'items:', Array.isArray(data?.data) ? data.data.length : 'N/A');
    res.json(data);
  } catch (error) {
    console.error('[UniFi] alerts error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// IDS/IPS alerts - multi-path probing for different firmware versions
app.get('/api/unifi/ids-alerts', authenticateToken, async (req, res) => {
  try {
    const baseUrl = process.env.UNIFI_CONTROLLER_URL;
    const apiKey = process.env.UNIFI_API_KEY;
    const site = await discoverUnifiSiteId();
    const headers = { 'X-API-Key': apiKey };
    const axOpts = { httpsAgent, headers, timeout: 15000 };

    let alerts = [];

    // Try IPS-specific event paths first (not generic stat/event which has client roaming)
    const idsPaths = [
      { url: `${baseUrl}/proxy/network/api/s/${site}/stat/ips/event`, label: 'stat/ips/event (proxy)' },
      { url: `${baseUrl}/proxy/network/v2/api/site/${site}/security/events`, label: 'v2 security/events' },
      { url: `${baseUrl}/api/s/${site}/stat/ips/event`, label: 'stat/ips/event (direct)' },
    ];

    for (const p of idsPaths) {
      try {
        console.log(`[UniFi] IDS trying: ${p.label}`);
        const r = await axios.get(p.url, axOpts);
        const data = r.data?.data || r.data || [];
        const items = Array.isArray(data) ? data : [];
        console.log(`[UniFi] IDS OK: ${p.label} -> ${items.length} events`);
        if (items.length > 0) {
          alerts = items;
          break;
        }
      } catch (e) {
        console.log(`[UniFi] IDS fail: ${p.label} -> ${e.response?.status || e.message}`);
      }
    }

    // If no IPS-specific data, try stat/event but FILTER for IPS/IDS only
    if (alerts.length === 0) {
      try {
        const fallbackUrl = `${baseUrl}/proxy/network/api/s/${site}/stat/event`;
        console.log(`[UniFi] IDS fallback: stat/event with filtering`);
        const r = await axios.get(fallbackUrl, axOpts);
        const data = r.data?.data || [];
        // Only keep IPS/IDS/security events, NOT client roaming/connection events
        alerts = data.filter(a =>
          a.key?.includes('EVT_IPS') ||
          a.key?.includes('EVT_IDS') ||
          a.key?.includes('EVT_FW') ||
          a.catname?.toLowerCase().includes('attack') ||
          a.catname?.toLowerCase().includes('intrusion') ||
          a.catname?.toLowerCase().includes('threat') ||
          a.inner_alert_signature
        );
        console.log(`[UniFi] IDS fallback: filtered ${data.length} -> ${alerts.length} security events`);
      } catch (e) {
        console.log(`[UniFi] IDS fallback fail: ${e.response?.status || e.message}`);
      }
    }

    const normalized = alerts.slice(0, 200).map(a => ({
      id: a._id || a.id || Math.random().toString(),
      timestamp: a.timestamp ? new Date(a.timestamp).toISOString() : a.datetime || a.time || '',
      severity: mapIdsSeverity(a),
      category: a.catname || a.category || a.event_type || a.key || 'unknown',
      signature: a.msg || a.message || a.name || a.inner_alert_signature || '',
      srcIp: a.src_ip || a.srcipAddress?.ip || '',
      srcPort: a.src_port || a.srcPort || 0,
      dstIp: a.dst_ip || a.dstipAddress?.ip || '',
      dstPort: a.dst_port || a.dstPort || 0,
      action: a.action || a.inner_alert_action || a.in_cat || 'alert',
      proto: a.proto || a.protocol || '',
      appProto: a.app_proto || '',
      interface: a.dest_interface || '',
    }));

    console.log(`[UniFi] IDS/IPS: returning ${normalized.length} alerts`);
    res.json({ alerts: normalized, total: alerts.length });
  } catch (error) {
    console.error('[UniFi] IDS/IPS error:', error.message);
    res.status(500).json({ error: error.message, alerts: [] });
  }
});

// Traffic Flows - real-time traffic sessions from UniFi Gateway
app.get('/api/unifi/flows', authenticateToken, async (req, res) => {
  try {
    const baseUrl = process.env.UNIFI_CONTROLLER_URL;
    const apiKey = process.env.UNIFI_API_KEY;
    const site = await discoverUnifiSiteId();
    const headers = { 'X-API-Key': apiKey, 'Content-Type': 'application/json' };
    const axOpts = { httpsAgent, headers, timeout: 15000 };

    let flows = [];

    const flowPaths = [
      { url: `${baseUrl}/proxy/network/v2/api/site/${site}/flows`, label: 'v2 flows', method: 'get' },
      { url: `${baseUrl}/proxy/network/v2/api/site/${site}/insight/flows`, label: 'v2 insight/flows', method: 'get' },
      { url: `${baseUrl}/proxy/network/v2/api/site/${site}/traffic/flows`, label: 'v2 traffic/flows', method: 'get' },
      { url: `${baseUrl}/proxy/network/v2/api/site/${site}/flows/active`, label: 'v2 flows/active', method: 'get' },
      { url: `${baseUrl}/proxy/network/v2/api/site/${site}/flows`, label: 'v2 flows (POST)', method: 'post',
        body: { limit: 100, orderBy: 'timestamp', orderDirection: 'desc' } },
    ];

    for (const p of flowPaths) {
      try {
        console.log(`[UniFi] Flows trying: ${p.label}`);
        let r;
        if (p.method === 'post') {
          r = await axios.post(p.url, p.body, axOpts);
        } else {
          r = await axios.get(p.url, axOpts);
        }
        const data = r.data?.data || r.data?.flows || r.data || [];
        const items = Array.isArray(data) ? data : [];
        console.log(`[UniFi] Flows OK: ${p.label} -> ${items.length} flows, keys: ${items[0] ? Object.keys(items[0]).join(',') : 'empty'}`);
        if (items.length > 0) {
          flows = items;
          break;
        }
      } catch (e) {
        console.log(`[UniFi] Flows fail: ${p.label} -> ${e.response?.status || e.message}`);
      }
    }

    const normalized = flows.slice(0, 200).map(f => ({
      id: f._id || f.id || Math.random().toString(),
      timestamp: f.timestamp ? (f.timestamp > 1e12 ? new Date(f.timestamp).toISOString() : new Date(f.timestamp * 1000).toISOString()) : f.datetime || '',
      source: f.source?.name || f.source?.ip || f.src_ip || f.client?.name || '',
      sourceIp: f.source?.ip || f.src_ip || '',
      sourceMac: f.source?.mac || f.src_mac || '',
      destination: f.destination?.name || f.destination?.ip || f.dst_ip || f.dest_name || '',
      destinationIp: f.destination?.ip || f.dst_ip || '',
      service: f.service || f.app_proto || f.protocol || '',
      risk: f.risk || f.threat_level || 'low',
      direction: f.direction || (f.is_outbound ? 'out' : 'in'),
      inInterface: f.in_interface || f.source_zone || f.in_zone || '',
      outInterface: f.out_interface || f.dest_zone || f.out_zone || '',
      action: f.action || 'allow',
      bytes: f.bytes || f.rx_bytes || 0,
      bytesOut: f.tx_bytes || 0,
      duration: f.duration || 0,
      country: f.destination?.country || f.geoip?.country || '',
    }));

    console.log(`[UniFi] Flows: returning ${normalized.length} flows`);
    res.json({ flows: normalized, total: flows.length });
  } catch (error) {
    console.error('[UniFi] Flows error:', error.message);
    res.status(500).json({ error: error.message, flows: [] });
  }
});

// Helper to map IDS severity from UniFi format
function mapIdsSeverity(alert) {
  // UniFi uses inner_alert_severity (1=high, 2=medium, 3=low)
  const sev = alert.inner_alert_severity || alert.severity;
  if (sev === 1 || sev === 'high' || sev === 'critical') return 'high';
  if (sev === 2 || sev === 'medium') return 'medium';
  if (sev === 3 || sev === 'low') return 'low';
  // Check category/key for hints
  if (alert.catname?.toLowerCase().includes('attack') || alert.key?.includes('EVT_IPS')) return 'high';
  if (alert.key?.includes('EVT_IDS')) return 'medium';
  return 'info';
}

app.get('/api/unifi/clients', authenticateToken, async (req, res) => {
  try {
    const data = await unifiRequest('/stat/sta');
    console.log('[UniFi] clients keys:', data ? Object.keys(data) : 'null', 'items:', Array.isArray(data?.data) ? data.data.length : 'N/A');
    res.json(data);
  } catch (error) {
    console.error('[UniFi] clients error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/unifi/devices', authenticateToken, async (req, res) => {
  try {
    const data = await unifiRequest('/stat/device');
    console.log('[UniFi] devices keys:', data ? Object.keys(data) : 'null', 'items:', Array.isArray(data?.data) ? data.data.length : 'N/A');
    res.json(data);
  } catch (error) {
    console.error('[UniFi] devices error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/unifi/health', authenticateToken, async (req, res) => {
  try {
    const data = await unifiRequest('/stat/health');
    console.log('[UniFi] health keys:', data ? Object.keys(data) : 'null');
    res.json(data);
  } catch (error) {
    console.error('[UniFi] health error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Restart AP (uses API key or legacy cookie)
app.post('/api/unifi/devices/:mac/restart', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Kun administratorer har tilgang' });
  }
  try {
    const site = await discoverUnifiSiteId();
    const baseUrl = process.env.UNIFI_CONTROLLER_URL;
    const headers = process.env.UNIFI_API_KEY
      ? { 'X-API-Key': process.env.UNIFI_API_KEY }
      : { Cookie: unifiCookie?.join('; ') };
    const cmdUrl = process.env.UNIFI_API_KEY
      ? `${baseUrl}/proxy/network/api/s/${site}/cmd/devmgr`
      : `${baseUrl}/api/s/${site}/cmd/devmgr`;
    const response = await axios.post(cmdUrl, { cmd: 'restart', mac: req.params.mac }, { httpsAgent, headers });
    res.json({ success: true, message: 'Enhet restartes', data: response.data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Power cycle a switch port (PoE)
app.post('/api/unifi/devices/:mac/port/:portIdx/cycle', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Kun administratorer har tilgang' });
  }
  try {
    const site = await discoverUnifiSiteId();
    const baseUrl = process.env.UNIFI_CONTROLLER_URL;
    const headers = process.env.UNIFI_API_KEY
      ? { 'X-API-Key': process.env.UNIFI_API_KEY }
      : { Cookie: unifiCookie?.join('; ') };
    const cmdUrl = process.env.UNIFI_API_KEY
      ? `${baseUrl}/proxy/network/api/s/${site}/cmd/devmgr`
      : `${baseUrl}/api/s/${site}/cmd/devmgr`;
    const response = await axios.post(cmdUrl,
      { cmd: 'power-cycle', mac: req.params.mac, port_idx: parseInt(req.params.portIdx) },
      { httpsAgent, headers }
    );
    res.json({ success: true, message: 'Port power-cycled', data: response.data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UniFi system events/logs
app.get('/api/unifi/events', authenticateToken, async (req, res) => {
  try {
    const baseUrl = process.env.UNIFI_CONTROLLER_URL;
    const apiKey = process.env.UNIFI_API_KEY;
    const site = await discoverUnifiSiteId();
    const headers = { 'X-API-Key': apiKey };
    const axOpts = { httpsAgent, headers, timeout: 15000 };

    let events = [];
    const eventPaths = [
      `${baseUrl}/proxy/network/api/s/${site}/stat/event`,
      `${baseUrl}/api/s/${site}/stat/event`,
      `${baseUrl}/proxy/network/v2/api/site/${site}/events`,
    ];

    for (const url of eventPaths) {
      try {
        console.log(`[UniFi] Events trying: ${url}`);
        const r = await axios.get(url, axOpts);
        const data = r.data?.data || r.data || [];
        const items = Array.isArray(data) ? data : [];
        console.log(`[UniFi] Events OK: ${url} -> ${items.length} events`);
        if (items.length > 0) {
          events = items;
          break;
        }
      } catch (e) {
        console.log(`[UniFi] Events fail: ${url} -> ${e.response?.status || e.message}`);
      }
    }

    const normalized = events.slice(0, 200).map(e => ({
      id: e._id || e.id || Math.random().toString(),
      timestamp: e.datetime || (e.time ? new Date(e.time).toISOString() : ''),
      key: e.key || '',
      msg: e.msg || e.message || '',
      subsystem: e.subsystem || '',
      type: e.key?.startsWith('EVT_IPS') ? 'ids' : e.key?.startsWith('EVT_FW') ? 'firewall' : 'system',
      srcIp: e.src_ip || '',
      dstIp: e.dst_ip || '',
      srcPort: e.src_port || 0,
      dstPort: e.dst_port || 0,
      proto: e.proto || '',
      action: e.inner_alert_action || e.action || '',
      deviceName: e.sw_name || e.ap_name || e.gw_name || '',
      deviceMac: e.sw || e.ap || e.gw || '',
      clientName: e.hostname || e.guest || e.user || '',
      clientMac: e.client || e.sta || '',
    }));

    console.log(`[UniFi] Events: returning ${normalized.length} events (IDS: ${normalized.filter(e => e.type === 'ids').length}, FW: ${normalized.filter(e => e.type === 'firewall').length}, SYS: ${normalized.filter(e => e.type === 'system').length})`);
    res.json({ events: normalized, total: events.length });
  } catch (error) {
    console.error('[UniFi] Events error:', error.message);
    res.status(500).json({ error: error.message, events: [] });
  }
});

// ============================================
// TrueNAS API
// ============================================

async function truenasRequest(endpoint) {
  const response = await axios.get(
    `${process.env.TRUENAS_URL}/api/v2.0${endpoint}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.TRUENAS_API_KEY}`,
      },
    }
  );
  return response.data;
}

app.get('/api/truenas/pools', async (req, res) => {
  try {
    const data = await truenasRequest('/pool');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/truenas/datasets', async (req, res) => {
  try {
    const data = await truenasRequest('/pool/dataset');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/truenas/snapshots', async (req, res) => {
  try {
    const data = await truenasRequest('/zfs/snapshot');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/truenas/system', async (req, res) => {
  try {
    const data = await truenasRequest('/system/info');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Proxmox VE API
// ============================================

async function proxmoxRequest(endpoint) {
  const url = process.env.PROXMOX_URL;
  const user = process.env.PROXMOX_USER;
  const tokenId = process.env.PROXMOX_TOKEN_ID;
  const tokenSecret = process.env.PROXMOX_TOKEN_SECRET;

  if (!url || !tokenId || !tokenSecret) {
    throw new Error('Proxmox er ikke konfigurert. Legg til URL, Token ID og Token Secret i Innstillinger.');
  }

  const authValue = `PVEAPIToken=${user}!${tokenId}=${tokenSecret}`;
  console.log(`[Proxmox] ${endpoint} -> ${url}/api2/json${endpoint} (user: ${user}, token: ${tokenId})`);

  try {
    const response = await axios.get(
      `${url}/api2/json${endpoint}`,
      {
        httpsAgent,
        headers: { Authorization: authValue },
        timeout: 10000,
      }
    );
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const msg = error.response?.data?.errors || error.response?.data || error.message;
    console.error(`[Proxmox] Feil ${status} på ${endpoint}: ${JSON.stringify(msg)}`);
    if (status === 401) {
      throw new Error(`Proxmox 401: Token avvist. Sjekk at Token ID (${tokenId}) og Secret er riktige for bruker ${user}.`);
    }
    if (status === 403) {
      throw new Error(`Proxmox 403: Tokenet "${tokenId}" har ikke tilgang til ${endpoint}. Gå til Proxmox > Datacenter > Permissions > API Tokens og gi tokenet rollen "PVEAuditor" eller "Administrator" på "/" (root).`);
    }
    throw new Error(`Proxmox feil (${status || 'network'}): ${error.message}`);
  }
}

app.get('/api/proxmox/nodes', authenticateToken, async (req, res) => {
  try {
    const data = await proxmoxRequest('/nodes');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/proxmox/vms', authenticateToken, async (req, res) => {
  try {
    // Hent alle noder først
    const nodes = await proxmoxRequest('/nodes');
    const vms = [];
    
    for (const node of nodes.data) {
      const nodeVms = await proxmoxRequest(`/nodes/${node.node}/qemu`);
      vms.push(...nodeVms.data.map(vm => ({ ...vm, node: node.node })));
    }
    
    res.json({ data: vms });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/proxmox/containers', authenticateToken, async (req, res) => {
  try {
    const nodes = await proxmoxRequest('/nodes');
    const containers = [];
    
    for (const node of nodes.data) {
      const nodeLxc = await proxmoxRequest(`/nodes/${node.node}/lxc`);
      containers.push(...nodeLxc.data.map(ct => ({ ...ct, node: node.node })));
    }
    
    res.json({ data: containers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proxmox/vms/:node/:vmid/:action', authenticateToken, async (req, res) => {
  try {
    const { node, vmid, action } = req.params;
    const response = await axios.post(
      `${process.env.PROXMOX_URL}/api2/json/nodes/${node}/qemu/${vmid}/status/${action}`,
      {},
      {
        httpsAgent,
        headers: {
          Authorization: `PVEAPIToken=${process.env.PROXMOX_USER}!${process.env.PROXMOX_TOKEN_ID}=${process.env.PROXMOX_TOKEN_SECRET}`,
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/proxmox/storage', authenticateToken, async (req, res) => {
  try {
    const nodes = await proxmoxRequest('/nodes');
    const storage = [];
    
    for (const node of nodes.data) {
      const nodeStorage = await proxmoxRequest(`/nodes/${node.node}/storage`);
      storage.push(...nodeStorage.data.map(s => ({ ...s, node: node.node })));
    }
    
    res.json({ data: storage });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/proxmox/cluster', authenticateToken, async (req, res) => {
  try {
    const data = await proxmoxRequest('/cluster/status');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ============================================

let openvasToken = null;

async function openvasLogin() {
  try {
    const response = await axios.post(
      `${process.env.OPENVAS_URL}/api/login`,
      {
        username: process.env.OPENVAS_USERNAME,
        password: process.env.OPENVAS_PASSWORD,
      }
    );
    openvasToken = response.data.token;
    return true;
  } catch (error) {
    console.error('OpenVAS login feilet:', error.message);
    return false;
  }
}

app.get('/api/openvas/scans', async (req, res) => {
  try {
    if (!openvasToken) await openvasLogin();
    
    const response = await axios.get(
      `${process.env.OPENVAS_URL}/api/tasks`,
      {
        headers: { Authorization: `Bearer ${openvasToken}` },
      }
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/openvas/vulnerabilities', async (req, res) => {
  try {
    if (!openvasToken) await openvasLogin();
    
    const response = await axios.get(
      `${process.env.OPENVAS_URL}/api/results`,
      {
        headers: { Authorization: `Bearer ${openvasToken}` },
      }
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start new OpenVAS scan
app.post('/api/openvas/scan', async (req, res) => {
  try {
    if (!openvasToken) await openvasLogin();
    
    const { target, name, scanConfig = 'full' } = req.body;
    
    if (!target || !name) {
      return res.status(400).json({ error: 'Mål og navn er påkrevd' });
    }
    
    // Create target first
    const targetResponse = await axios.post(
      `${process.env.OPENVAS_URL}/api/targets`,
      { name: `Target: ${name}`, hosts: target },
      { headers: { Authorization: `Bearer ${openvasToken}` } }
    );
    
    const targetId = targetResponse.data.id;
    
    // Get scan config ID based on type
    const configMap = {
      'full': 'daba56c8-73ec-11df-a475-002264764cea', // Full and fast
      'discovery': '8715c877-47a0-438d-98a3-27c7a6ab2196', // Host Discovery
      'system': '74db13d6-7489-11df-91b9-002264764cea', // System Discovery
    };
    
    // Create and start task
    const taskResponse = await axios.post(
      `${process.env.OPENVAS_URL}/api/tasks`,
      {
        name,
        target_id: targetId,
        config_id: configMap[scanConfig] || configMap['full'],
      },
      { headers: { Authorization: `Bearer ${openvasToken}` } }
    );
    
    const taskId = taskResponse.data.id;
    
    // Start the task
    await axios.post(
      `${process.env.OPENVAS_URL}/api/tasks/${taskId}/start`,
      {},
      { headers: { Authorization: `Bearer ${openvasToken}` } }
    );
    
    res.json({ success: true, taskId, targetId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get scan status
app.get('/api/openvas/scan/:taskId/status', async (req, res) => {
  try {
    if (!openvasToken) await openvasLogin();
    
    const { taskId } = req.params;
    const response = await axios.get(
      `${process.env.OPENVAS_URL}/api/tasks/${taskId}`,
      { headers: { Authorization: `Bearer ${openvasToken}` } }
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Nmap scanning (background job system)
// ============================================

const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// In-memory job store for background nmap scans
const nmapJobs = new Map();
let jobIdCounter = 1;

// Persistent nmap results file
const NMAP_RESULTS_FILE = path.join(DATA_DIR, 'nmap-results.json');

function loadNmapResults() {
  try {
    if (fs.existsSync(NMAP_RESULTS_FILE)) {
      return JSON.parse(fs.readFileSync(NMAP_RESULTS_FILE, 'utf8'));
    }
  } catch {}
  return [];
}

function saveNmapResult(result) {
  try {
    const results = loadNmapResults();
    results.unshift(result); // newest first
    // Keep max 50 results
    if (results.length > 50) results.length = 50;
    fs.writeFileSync(NMAP_RESULTS_FILE, JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('Could not save nmap result:', err.message);
  }
}

// Clean up old completed/failed jobs after 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of nmapJobs) {
    if ((job.status === 'complete' || job.status === 'error') && job.updatedAt < cutoff) {
      nmapJobs.delete(id);
    }
  }
}, 5 * 60 * 1000);

// Start a new nmap scan job (returns immediately)
app.post('/api/nmap/scan-start', (req, res) => {
  const { target, scanType = 'quick' } = req.body;

  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
  if (!ipRegex.test(target)) {
    return res.status(400).json({ error: 'Ugyldig mål-format' });
  }

  const jobId = String(jobIdCounter++);
  const job = {
    id: jobId,
    target,
    scanType,
    status: 'scanning',
    percent: 0,
    hostsFound: 0,
    result: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  nmapJobs.set(jobId, job);

  let nmapArgs = ['-sn', '--stats-every', '2s'];
  if (scanType === 'ports') nmapArgs = ['-sT', '-F', '--stats-every', '2s'];
  if (scanType === 'full') nmapArgs = ['-sV', '-sC', '--stats-every', '2s'];
  nmapArgs.push(target, '-oX', '-');

  const nmap = spawn('nmap', nmapArgs);
  job.process = nmap;
  let xmlOutput = '';

  nmap.stdout.on('data', (data) => {
    const chunk = data.toString();
    xmlOutput += chunk;

    const statsMatch = chunk.match(/About ([\d.]+)% done/);
    if (statsMatch) {
      job.percent = parseFloat(statsMatch[1]);
      job.updatedAt = Date.now();
    }

    const hostMatches = (xmlOutput.match(/<host /g) || []).length;
    if (hostMatches > job.hostsFound) {
      job.hostsFound = hostMatches;
      job.updatedAt = Date.now();
    }
  });

  nmap.stderr.on('data', (data) => {
    const msg = data.toString();
    const statsMatch = msg.match(/About ([\d.]+)% done/);
    if (statsMatch) {
      job.percent = parseFloat(statsMatch[1]);
      job.updatedAt = Date.now();
    }
  });

  nmap.on('close', (code) => {
    if (code === 0) {
      job.status = 'complete';
      job.percent = 100;
      job.result = xmlOutput;
      // Save result to disk for persistence
      saveNmapResult({
        id: job.id,
        target: job.target,
        scanType: job.scanType,
        result: xmlOutput,
        hostsFound: job.hostsFound,
        completedAt: Date.now(),
      });
    } else {
      job.status = 'error';
      job.error = 'Scan feilet med kode ' + code;
    }
    job.updatedAt = Date.now();
    delete job.process;
  });

  nmap.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
    job.updatedAt = Date.now();
    delete job.process;
  });

  res.json({ jobId, status: 'scanning' });
});

// Poll job status
app.get('/api/nmap/scan-status/:jobId', (req, res) => {
  const job = nmapJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Jobb ikke funnet' });
  }
  res.json({
    id: job.id,
    target: job.target,
    scanType: job.scanType,
    status: job.status,
    percent: job.percent,
    hostsFound: job.hostsFound,
    result: job.status === 'complete' ? job.result : null,
    error: job.error,
    createdAt: job.createdAt
  });
});

// List active/recent jobs
app.get('/api/nmap/jobs', (req, res) => {
  const jobs = [];
  for (const [, job] of nmapJobs) {
    jobs.push({
      id: job.id,
      target: job.target,
      scanType: job.scanType,
      status: job.status,
      percent: job.percent,
      hostsFound: job.hostsFound,
      createdAt: job.createdAt,
      error: job.error
    });
  }
  res.json(jobs);
});

// Get saved/historical nmap results
app.get('/api/nmap/results', (req, res) => {
  const results = loadNmapResults();
  res.json(results);
});

// Cancel a running job
app.post('/api/nmap/scan-cancel/:jobId', (req, res) => {
  const job = nmapJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Jobb ikke funnet' });
  }
  if (job.process) {
    job.process.kill();
    delete job.process;
  }
  job.status = 'cancelled';
  job.updatedAt = Date.now();
  res.json({ status: 'cancelled' });
});

// Keep legacy SSE endpoint for backward compat but also as background job
app.get('/api/nmap/scan-stream', (req, res) => {
  const { target, scanType = 'quick' } = req.query;
  
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
  if (!ipRegex.test(target)) {
    return res.status(400).json({ error: 'Ugyldig mål-format' });
  }
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  let nmapArgs = ['-sn', '--stats-every', '2s'];
  if (scanType === 'ports') nmapArgs = ['-sT', '-F', '--stats-every', '2s'];
  if (scanType === 'full') nmapArgs = ['-sV', '-sC', '--stats-every', '2s'];
  nmapArgs.push(target, '-oX', '-');
  
  const nmap = spawn('nmap', nmapArgs);
  let xmlOutput = '';
  let hostsFound = 0;
  
  res.write(`data: ${JSON.stringify({ type: 'started', target, scanType })}\n\n`);
  
  nmap.stdout.on('data', (data) => {
    const chunk = data.toString();
    xmlOutput += chunk;
    const statsMatch = chunk.match(/About ([\d.]+)% done/);
    if (statsMatch) {
      res.write(`data: ${JSON.stringify({ type: 'progress', percent: parseFloat(statsMatch[1]) })}\n\n`);
    }
    const hostMatches = (xmlOutput.match(/<host /g) || []).length;
    if (hostMatches > hostsFound) {
      hostsFound = hostMatches;
      res.write(`data: ${JSON.stringify({ type: 'hosts_update', count: hostsFound })}\n\n`);
    }
  });
  
  nmap.stderr.on('data', (data) => {
    const msg = data.toString();
    const statsMatch = msg.match(/About ([\d.]+)% done/);
    if (statsMatch) {
      res.write(`data: ${JSON.stringify({ type: 'progress', percent: parseFloat(statsMatch[1]) })}\n\n`);
    }
  });
  
  nmap.on('close', (code) => {
    if (code === 0) {
      res.write(`data: ${JSON.stringify({ type: 'complete', result: xmlOutput })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Scan feilet med kode ' + code })}\n\n`);
    }
    res.end();
  });
  
  nmap.on('error', (err) => {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  });
  
  // No longer kill nmap on disconnect - let it run
  req.on('close', () => {
    // Don't kill nmap - it continues in background
  });
});

// Get WAN IP
app.get('/api/network/wan-ip', async (req, res) => {
  try {
    const response = await axios.get('https://api.ipify.org?format=json', { timeout: 10000 });
    res.json({ ip: response.data.ip });
  } catch (error) {
    // Fallback services
    try {
      const response = await axios.get('https://ifconfig.me/ip', { timeout: 10000, responseType: 'text' });
      res.json({ ip: response.data.trim() });
    } catch (err) {
      res.status(500).json({ error: 'Kunne ikke hente WAN IP' });
    }
  }
});

// Standard POST endpoint (fallback)
app.post('/api/nmap/scan', async (req, res) => {
  try {
    const { target, scanType = 'quick' } = req.body;
    
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!ipRegex.test(target)) {
      return res.status(400).json({ error: 'Ugyldig mål-format' });
    }
    
    let nmapArgs = '-sn';
    if (scanType === 'ports') nmapArgs = '-sT -F';
    if (scanType === 'full') nmapArgs = '-sV -sC';
    
    const { stdout } = await execAsync(`nmap ${nmapArgs} ${target} -oX -`, {
      timeout: 300000,
    });
    
    res.json({ result: stdout });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Security Analysis Endpoints
// ============================================

const tls = require('tls');
const dns = require('dns');
const net = require('net');

// SSL/TLS Certificate Check
app.post('/api/security/ssl-check', authenticateToken, async (req, res) => {
  const { targets } = req.body; // Array of { name, host, port }
  
  if (!targets || !Array.isArray(targets)) {
    return res.status(400).json({ error: 'Mål-liste er påkrevd' });
  }

  const results = [];

  for (const target of targets) {
    try {
      const result = await new Promise((resolve, reject) => {
        const socket = tls.connect({
          host: target.host,
          port: target.port || 443,
          rejectUnauthorized: false,
          timeout: 10000,
        }, () => {
          const cert = socket.getPeerCertificate();
          const authorized = socket.authorized;
          socket.end();

          if (!cert || !cert.subject) {
            resolve({ name: target.name, host: target.host, port: target.port, status: 'error', error: 'Ingen sertifikat funnet' });
            return;
          }

          const validFrom = new Date(cert.valid_from);
          const validTo = new Date(cert.valid_to);
          const now = new Date();
          const daysLeft = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));
          const isExpired = daysLeft < 0;
          const isSelfSigned = cert.issuer && cert.subject && 
            JSON.stringify(cert.issuer) === JSON.stringify(cert.subject);

          resolve({
            name: target.name,
            host: target.host,
            port: target.port || 443,
            status: 'ok',
            subject: cert.subject?.CN || cert.subject?.O || 'Unknown',
            issuer: cert.issuer?.CN || cert.issuer?.O || 'Unknown',
            validFrom: validFrom.toISOString(),
            validTo: validTo.toISOString(),
            daysLeft,
            isExpired,
            isSelfSigned,
            authorized,
            serialNumber: cert.serialNumber,
            fingerprint: cert.fingerprint256 || cert.fingerprint,
            protocol: socket.getProtocol(),
          });
        });

        socket.on('error', (err) => {
          resolve({ name: target.name, host: target.host, port: target.port, status: 'error', error: err.message });
        });

        socket.setTimeout(10000, () => {
          socket.destroy();
          resolve({ name: target.name, host: target.host, port: target.port, status: 'error', error: 'Timeout' });
        });
      });

      results.push(result);
    } catch (err) {
      results.push({ name: target.name, host: target.host, port: target.port, status: 'error', error: err.message });
    }
  }

  res.json({ results });
});

// Firewall cache file
const FIREWALL_CACHE_FILE = path.join(DATA_DIR, 'firewall-cache.json');
let firewallCache = null;

// Load firewall cache from disk on startup
try {
  if (fs.existsSync(FIREWALL_CACHE_FILE)) {
    firewallCache = JSON.parse(fs.readFileSync(FIREWALL_CACHE_FILE, 'utf8'));
    console.log(`[UniFi] Loaded firewall cache: ${firewallCache?.firewallRules?.length || 0} rules, ${firewallCache?.portForwards?.length || 0} port forwards`);
  }
} catch (e) {
  console.log('[UniFi] No firewall cache found');
}

// Get cached firewall rules (no UniFi call)
app.get('/api/security/firewall-rules/cached', authenticateToken, (req, res) => {
  if (firewallCache) {
    res.json({ ...firewallCache, fromCache: true });
  } else {
    res.json({ firewallRules: [], portForwards: [], firewallGroups: [], fromCache: true, empty: true });
  }
});

// Firewall Audit - Get UDM Pro firewall rules (uses API key) + cache result
app.get('/api/security/firewall-rules', authenticateToken, async (req, res) => {
  try {
    const baseUrl = process.env.UNIFI_CONTROLLER_URL;
    const apiKey = process.env.UNIFI_API_KEY;
    const site = await discoverUnifiSiteId();
    
    const headers = { 'X-API-Key': apiKey };
    const axOpts = { httpsAgent, headers, timeout: 10000 };

    // Fetch all firewall data in parallel
    const [
      policiesRes,
      legacyRulesRes,
      pfRes,
      fgRes,
      trafficRulesRes,
      trafficRoutesRes,
      zonesRes,
    ] = await Promise.all([
      axios.get(`${baseUrl}/proxy/network/v2/api/site/${site}/firewall-policies`, axOpts)
        .then(r => { console.log(`[UniFi] Firewall policies: ${(r.data || []).length}`); return r; })
        .catch(e => { console.log(`[UniFi] Firewall policies: ${e.response?.status || e.message}`); return { data: [] }; }),
      axios.get(`${baseUrl}/proxy/network/api/s/${site}/rest/firewallrule`, axOpts)
        .then(r => { console.log(`[UniFi] Legacy fw rules: ${(r.data?.data || []).length}`); return r; })
        .catch(e => { console.log(`[UniFi] Legacy fw rules: ${e.response?.status || e.message}`); return { data: { data: [] } }; }),
      unifiRequest('/rest/portforward').catch(() => ({ data: [] })),
      unifiRequest('/rest/firewallgroup').catch(() => ({ data: [] })),
      axios.get(`${baseUrl}/proxy/network/v2/api/site/${site}/trafficrules`, axOpts)
        .then(r => { console.log(`[UniFi] Traffic rules: ${(r.data || []).length}`); return r; })
        .catch(e => { console.log(`[UniFi] Traffic rules: ${e.response?.status || e.message}`); return { data: [] }; }),
      axios.get(`${baseUrl}/proxy/network/v2/api/site/${site}/trafficroutes`, axOpts)
        .then(r => { console.log(`[UniFi] Traffic routes: ${(r.data || []).length}`); return r; })
        .catch(e => { console.log(`[UniFi] Traffic routes: ${e.response?.status || e.message}`); return { data: [] }; }),
      axios.get(`${baseUrl}/proxy/network/v2/api/site/${site}/firewall/zones`, axOpts)
        .then(r => { console.log(`[UniFi] Firewall zones: ${(r.data || []).length}`); return r; })
        .catch(e => { console.log(`[UniFi] Firewall zones: ${e.response?.status || e.message}`); return { data: [] }; }),
    ]);

    const firewallPolicies = policiesRes.data || [];
    const legacyRules = legacyRulesRes.data?.data || [];
    const firewallRules = firewallPolicies.length > 0 ? firewallPolicies : legacyRules;

    const result = {
      firewallRules,
      firewallPolicies,
      portForwards: pfRes?.data || [],
      firewallGroups: fgRes?.data || [],
      trafficRules: trafficRulesRes.data || [],
      trafficRoutes: trafficRoutesRes.data || [],
      firewallZones: zonesRes.data || [],
      isZoneBased: firewallPolicies.length > 0,
      lastUpdated: new Date().toISOString(),
    };

    // Cache to memory and disk
    firewallCache = result;
    try {
      fs.writeFileSync(FIREWALL_CACHE_FILE, JSON.stringify(result, null, 2));
      console.log(`[UniFi] Firewall cache saved: ${firewallRules.length} rules`);
    } catch (e) {
      console.error('[UniFi] Failed to save firewall cache:', e.message);
    }

    res.json(result);
  } catch (error) {
    console.error('[UniFi] Firewall endpoint error:', error.message);
    // Return cache if available on error
    if (firewallCache) {
      res.json({ ...firewallCache, fromCache: true, error: error.message });
    } else {
      res.json({
        firewallRules: [],
        firewallPolicies: [],
        portForwards: [],
        firewallGroups: [],
        trafficRules: [],
        trafficRoutes: [],
        firewallZones: [],
        error: error.message,
      });
    }
  }
});

// DNS Leak Test
app.get('/api/security/dns-leak', authenticateToken, async (req, res) => {
  try {
    const results = [];
    
    // Check which DNS servers are being used
    const resolvers = dns.getServers();
    results.push({ test: 'configured_dns', servers: resolvers });

    // Test DNS resolution through different methods
    const testDomains = ['whoami.akamai.net', 'myip.opendns.com', 'o-o.myaddr.l.google.com'];
    
    for (const domain of testDomains) {
      try {
        const addresses = await new Promise((resolve, reject) => {
          dns.resolve4(domain, (err, addrs) => {
            if (err) reject(err);
            else resolve(addrs);
          });
        });
        results.push({ test: 'dns_resolve', domain, addresses, status: 'ok' });
      } catch (err) {
        results.push({ test: 'dns_resolve', domain, status: 'error', error: err.message });
      }
    }

    // Check if DNS over HTTPS is leaking by comparing resolver IP to expected
    try {
      const dnsCheckRes = await axios.get('https://1.1.1.1/cdn-cgi/trace', { timeout: 5000, responseType: 'text' });
      const lines = dnsCheckRes.data.split('\n');
      const ipLine = lines.find(l => l.startsWith('ip='));
      const locLine = lines.find(l => l.startsWith('loc='));
      results.push({
        test: 'external_ip_check',
        ip: ipLine ? ipLine.split('=')[1] : 'unknown',
        location: locLine ? locLine.split('=')[1] : 'unknown',
        status: 'ok',
      });
    } catch {
      results.push({ test: 'external_ip_check', status: 'error' });
    }

    // Check for WebRTC-style leak via multiple DNS providers
    const dnsProviders = [
      { name: 'Cloudflare', ip: '1.1.1.1' },
      { name: 'Google', ip: '8.8.8.8' },
      { name: 'Quad9', ip: '9.9.9.9' },
    ];
    
    for (const provider of dnsProviders) {
      try {
        const start = Date.now();
        await new Promise((resolve, reject) => {
          const resolver = new dns.Resolver();
          resolver.setServers([provider.ip]);
          resolver.resolve4('example.com', (err, addrs) => {
            if (err) reject(err);
            else resolve(addrs);
          });
        });
        const responseTime = Date.now() - start;
        results.push({ test: 'dns_provider_check', provider: provider.name, ip: provider.ip, responseTime, status: 'ok' });
      } catch (err) {
        results.push({ test: 'dns_provider_check', provider: provider.name, ip: provider.ip, status: 'error', error: err.message });
      }
    }

    res.json({ results, resolvers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GeoIP Lookup
// ============================================

app.get('/api/geoip/:ip', async (req, res) => {
  try {
    const { ip } = req.params;
    const response = await axios.get(`http://ip-api.com/json/${ip}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/geoip/batch', async (req, res) => {
  try {
    const { ips } = req.body;
    const response = await axios.post('http://ip-api.com/batch', ips.slice(0, 100));
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Health check
// ============================================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    services: {
      unifi: !!process.env.UNIFI_CONTROLLER_URL,
      truenas: !!process.env.TRUENAS_URL,
      proxmox: !!process.env.PROXMOX_URL,
      openvas: !!process.env.OPENVAS_URL,
    }
  });
});

// Test individual service connection
app.post('/api/health/test/:service', authenticateToken, async (req, res) => {
  const { service } = req.params;
  
  try {
    let success = false;
    let message = '';
    const start = Date.now();
    
    switch (service) {
      case 'backend':
        success = true;
        message = 'Backend API kjører normalt';
        break;
        
      case 'unifi':
        if (!process.env.UNIFI_CONTROLLER_URL) {
          message = 'UniFi URL ikke konfigurert i .env';
          break;
        }
        if (process.env.UNIFI_API_KEY) {
          // Test with API key
          const unifiTestRes = await axios.get(`${process.env.UNIFI_CONTROLLER_URL}/proxy/network/api/s/${process.env.UNIFI_SITE || 'default'}/stat/health`, { 
            httpsAgent, 
            headers: { 'X-API-Key': process.env.UNIFI_API_KEY },
            timeout: 10000 
          });
          success = true;
          message = `UniFi Controller tilgjengelig (API-nøkkel, ${unifiTestRes.data?.data?.length || 0} subsystemer)`;
        } else {
          await axios.get(`${process.env.UNIFI_CONTROLLER_URL}/status`, { 
            httpsAgent, 
            timeout: 10000 
          });
          success = true;
          message = 'UniFi Controller tilgjengelig (legacy auth)';
        }
        break;
        
      case 'truenas':
        if (!process.env.TRUENAS_URL) {
          message = 'TrueNAS URL ikke konfigurert i .env';
          break;
        }
        await axios.get(`${process.env.TRUENAS_URL}/api/v2.0/system/info`, {
          headers: { Authorization: `Bearer ${process.env.TRUENAS_API_KEY}` },
          timeout: 10000,
        });
        success = true;
        message = 'TrueNAS API tilgjengelig';
        break;
        
      case 'proxmox':
        if (!process.env.PROXMOX_URL) {
          message = 'Proxmox URL ikke konfigurert i .env';
          break;
        }
        await axios.get(`${process.env.PROXMOX_URL}/api2/json/version`, {
          httpsAgent,
          headers: {
            Authorization: `PVEAPIToken=${process.env.PROXMOX_USER}!${process.env.PROXMOX_TOKEN_ID}=${process.env.PROXMOX_TOKEN_SECRET}`,
          },
          timeout: 10000,
        });
        success = true;
        message = 'Proxmox VE tilgjengelig';
        break;
        
      case 'openvas':
        if (!process.env.OPENVAS_URL) {
          message = 'OpenVAS URL ikke konfigurert i .env';
          break;
        }
        await axios.get(`${process.env.OPENVAS_URL}/api/version`, { timeout: 10000 });
        success = true;
        message = 'OpenVAS/Greenbone tilgjengelig';
        break;
        
      default:
        message = `Ukjent tjeneste: ${service}`;
    }
    
    res.json({ 
      success, 
      message,
      responseTime: Date.now() - start
    });
  } catch (error) {
    res.json({ 
      success: false, 
      message: error.message || 'Tilkoblingsfeil'
    });
  }
});

// Comprehensive health check for all services
app.get('/api/health/all', async (req, res) => {
  const services = [];
  const os = require('os');
  
  // Check backend itself
  services.push({
    name: 'backend',
    status: 'online',
    message: 'API kjører normalt',
    responseTime: 1,
  });
  
  // Check UniFi - actually test API access, not just URL reachability
  if (process.env.UNIFI_CONTROLLER_URL) {
    try {
      const start = Date.now();
      await unifiRequest('/stat/health');
      services.push({
        name: 'unifi',
        status: 'online',
        message: `UniFi OK (${getUnifiAuthMethod()})`,
        responseTime: Date.now() - start,
      });
    } catch (error) {
      services.push({
        name: 'unifi',
        status: 'offline',
        message: `${error.message} (auth: ${getUnifiAuthMethod() || 'ikke konfigurert'})`,
      });
    }
  }
  
  // Check TrueNAS
  if (process.env.TRUENAS_URL) {
    try {
      const start = Date.now();
      await axios.get(`${process.env.TRUENAS_URL}/api/v2.0/system/info`, {
        headers: { Authorization: `Bearer ${process.env.TRUENAS_API_KEY}` },
        timeout: 5000,
      });
      services.push({
        name: 'truenas',
        status: 'online',
        message: 'TrueNAS tilgjengelig',
        responseTime: Date.now() - start,
      });
    } catch (error) {
      services.push({
        name: 'truenas',
        status: 'offline',
        message: error.message,
      });
    }
  }
  
  // Check Proxmox - actually test API token
  if (process.env.PROXMOX_URL) {
    try {
      const start = Date.now();
      await proxmoxRequest('/version');
      services.push({
        name: 'proxmox',
        status: 'online',
        message: 'Proxmox VE tilgjengelig',
        responseTime: Date.now() - start,
      });
    } catch (error) {
      services.push({
        name: 'proxmox',
        status: 'offline',
        message: error.message,
      });
    }
  }
  
  // Check OpenVAS
  if (process.env.OPENVAS_URL) {
    try {
      const start = Date.now();
      await axios.get(`${process.env.OPENVAS_URL}/api/version`, { timeout: 5000 });
      services.push({
        name: 'openvas',
        status: 'online',
        message: 'OpenVAS/Greenbone tilgjengelig',
        responseTime: Date.now() - start,
      });
    } catch (error) {
      services.push({
        name: 'openvas',
        status: 'offline',
        message: error.message,
      });
    }
  }
  
  // Check Docker
  try {
    const start = Date.now();
    await execAsync('docker ps -q 2>/dev/null', { timeout: 5000 });
    services.push({
      name: 'docker',
      status: 'online',
      message: 'Docker daemon kjører',
      responseTime: Date.now() - start,
    });
  } catch (error) {
    services.push({
      name: 'docker',
      status: 'offline',
      message: 'Docker ikke tilgjengelig',
    });
  }
  
  // System info
  const uptime = os.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  
  // Get real disk usage
  let diskUsed = 0, diskTotal = 0;
  try {
    const { stdout } = await execAsync("df -B1 / | tail -1 | awk '{print $3, $2}'");
    const parts = stdout.trim().split(/\s+/);
    if (parts.length >= 2) {
      diskUsed = parseInt(parts[0]) || 0;
      diskTotal = parseInt(parts[1]) || 0;
    }
  } catch (e) {
    console.error('Disk info feilet:', e.message);
  }

  res.json({
    services,
    system: {
      uptime: days > 0 ? `${days}d ${hours}t` : `${hours}t ${minutes}m`,
      load: os.loadavg(),
      memory: {
        used: os.totalmem() - os.freemem(),
        total: os.totalmem(),
      },
      disk: { used: diskUsed, total: diskTotal },
    },
  });
});

// ============================================
// Docker Management
// ============================================

app.get('/api/docker/containers', authenticateToken, async (req, res) => {
  try {
    const { stdout } = await execAsync('docker ps -a --format "{{json .}}"');
    const containers = stdout.trim().split('\n').filter(Boolean).map(line => {
      const c = JSON.parse(line);
      return {
        id: c.ID,
        name: c.Names,
        image: c.Image,
        status: c.Status,
        state: c.State.toLowerCase(),
        ports: c.Ports ? c.Ports.split(', ').filter(Boolean) : [],
        created: c.CreatedAt,
        uptime: c.Status.includes('Up') ? c.Status.replace('Up ', '') : null,
      };
    });
    res.json({ containers });
  } catch (error) {
    res.status(500).json({ error: error.message, containers: [] });
  }
});

app.post('/api/docker/containers/:id/start', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await execAsync(`docker start ${id}`);
    res.json({ success: true, message: 'Container startet' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/docker/containers/:id/stop', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await execAsync(`docker stop ${id}`);
    res.json({ success: true, message: 'Container stoppet' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/docker/containers/:id/restart', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await execAsync(`docker restart ${id}`);
    res.json({ success: true, message: 'Container restartet' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/docker/containers/:id/logs', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { tail = 100 } = req.query;
    
    const { stdout, stderr } = await execAsync(
      `docker logs --tail ${tail} --timestamps ${id} 2>&1`,
      { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer
    );
    
    res.json({ logs: stdout || stderr || 'Ingen logs' });
  } catch (error) {
    res.status(500).json({ error: error.message, logs: '' });
  }
});

// ============================================
// System Installation Management
// ============================================

// Get system info (OS, disk, RAM, CPU)
app.get('/api/system/info', authenticateToken, async (req, res) => {
  try {
    const os = require('os');
    
    // OS info
    let osVersion = '';
    try {
      const { stdout } = await execAsync('cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\'', { timeout: 3000 });
      osVersion = stdout.trim() || `${os.type()} ${os.release()}`;
    } catch {
      osVersion = `${os.type()} ${os.release()}`;
    }

    // Hostname
    const hostname = os.hostname();

    // Uptime
    const uptimeSec = os.uptime();
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const uptime = days > 0 ? `${days}d ${hours}t` : `${hours}t ${Math.floor((uptimeSec % 3600) / 60)}m`;

    // CPU
    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model || 'Ukjent';
    const cpuCores = cpus.length;
    let cpuUsage = 0;
    try {
      const { stdout } = await execAsync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' 2>/dev/null", { timeout: 3000 });
      cpuUsage = parseFloat(stdout.trim()) || 0;
    } catch {
      // Fallback: calculate from os.loadavg
      cpuUsage = Math.min(100, Math.round((os.loadavg()[0] / cpuCores) * 100));
    }

    // RAM
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Disk - show all physical mount points, not just root
    let diskTotal = 0, diskUsed = 0;
    let disks = [];
    try {
      // Get all real filesystems (exclude tmpfs, devtmpfs, squashfs etc.)
      const { stdout } = await execAsync("df -B1 -x tmpfs -x devtmpfs -x squashfs -x overlay 2>/dev/null | tail -n+2", { timeout: 3000 });
      const lines = stdout.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 6) {
          const total = parseInt(parts[1]) || 0;
          const used = parseInt(parts[2]) || 0;
          const mount = parts[5];
          disks.push({ mount, total, used });
          diskTotal += total;
          diskUsed += used;
        }
      }
    } catch {}

    console.log('[System] Disks found:', disks.map(d => `${d.mount}: ${Math.round(d.total/1073741824)}GB`).join(', '));

    res.json({
      os: osVersion,
      hostname,
      uptime,
      kernel: os.release(),
      arch: os.arch(),
      cpu: { model: cpuModel, cores: cpuCores, usage: Math.round(cpuUsage) },
      ram: { total: totalMem, used: usedMem, free: freeMem },
      disk: { total: diskTotal, used: diskUsed },
      disks,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check status of all installable services
app.get('/api/system/services', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Kun administratorer har tilgang' });
  }

  const checks = [
    { id: 'nodejs', name: 'Node.js', cmd: 'node --version', activeCmd: null },
    { id: 'nginx', name: 'Nginx', cmd: 'nginx -v 2>&1', activeCmd: 'systemctl is-active nginx' },
    { id: 'docker', name: 'Docker', cmd: 'docker --version', activeCmd: 'systemctl is-active docker' },
    { id: 'nmap', name: 'Nmap', cmd: 'which nmap > /dev/null 2>&1 && nmap --version 2>&1 | head -n1', activeCmd: null },
    { id: 'openvas', name: 'OpenVAS/Greenbone', cmd: 'docker inspect openvas --format="{{.Config.Image}}" 2>/dev/null', activeCmd: 'docker inspect openvas --format="{{.State.Status}}" 2>/dev/null' },
  ];

  const results = await Promise.all(checks.map(async (svc) => {
    let installed = false;
    let version = '';
    let running = null;

    try {
      const { stdout } = await execAsync(svc.cmd, { timeout: 5000 });
      installed = true;
      version = stdout.trim().replace(/^[a-zA-Z\s:]+/, '').trim();
    } catch {}

    if (svc.activeCmd) {
      try {
        const { stdout } = await execAsync(svc.activeCmd, { timeout: 5000 });
        const status = stdout.trim();
        running = status === 'active' || status === 'running';
      } catch {
        running = false;
      }
    }

    return { id: svc.id, name: svc.name, installed, version, running };
  }));

  res.json({ services: results });
});

// Install a service (admin only) - streams progress via SSE
app.post('/api/system/install/:serviceId', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Kun administratorer har tilgang' });
  }

  const { serviceId } = req.params;

  // Map service IDs to install commands
  const installScripts = {
    nodejs: [
      'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -',
      'apt install -y nodejs',
    ],
    nginx: [
      'apt install -y nginx',
      'systemctl enable nginx',
      'systemctl start nginx',
    ],
    docker: [
      'apt install -y apt-transport-https ca-certificates curl gnupg lsb-release',
      'curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg 2>/dev/null || true',
      'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null',
      'apt update',
      'apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin',
      'systemctl enable docker',
      'systemctl start docker',
    ],
    nmap: [
      'apt install -y nmap',
    ],
    openvas: [
      'docker volume create openvas-data 2>/dev/null || true',
      'docker stop openvas 2>/dev/null || true',
      'docker rm openvas 2>/dev/null || true',
      'docker run -d --name openvas --restart unless-stopped -p 9392:9392 -v openvas-data:/var/lib/openvas greenbone/gsm-community:stable',
    ],
  };

  const commands = installScripts[serviceId];
  if (!commands) {
    return res.status(400).json({ error: `Ukjent tjeneste: ${serviceId}` });
  }

  // SSE response for streaming progress
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent({ type: 'start', message: `Starter installasjon av ${serviceId}...`, total: commands.length });

  let step = 0;
  const runNext = () => {
    if (step >= commands.length) {
      sendEvent({ type: 'complete', message: `${serviceId} installert!` });
      res.end();
      return;
    }

    const cmd = commands[step];
    sendEvent({ type: 'progress', step: step + 1, total: commands.length, message: `Kjører: ${cmd.substring(0, 80)}...` });

    const child = require('child_process').exec(cmd, { timeout: 300000, maxBuffer: 50 * 1024 * 1024 });

    child.stdout?.on('data', (data) => {
      sendEvent({ type: 'log', message: data.toString().trim() });
    });

    child.stderr?.on('data', (data) => {
      sendEvent({ type: 'log', message: data.toString().trim() });
    });

    child.on('close', (code) => {
      if (code !== 0 && code !== null) {
        sendEvent({ type: 'error', message: `Kommando feilet med kode ${code}: ${cmd}` });
        // Continue anyway for non-critical failures
      }
      step++;
      runNext();
    });

    child.on('error', (err) => {
      sendEvent({ type: 'error', message: `Feil: ${err.message}` });
      step++;
      runNext();
    });
  };

  req.on('close', () => {
    // Client disconnected
  });

  runNext();
});

// Restart a system service (admin only)
app.post('/api/system/restart/:serviceId', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Kun administratorer har tilgang' });
  }

  const { serviceId } = req.params;
  const restartCmds = {
    nginx: 'systemctl restart nginx',
    docker: 'systemctl restart docker',
    openvas: 'docker restart openvas',
    'netguard-api': 'systemctl restart netguard-api',
  };

  const cmd = restartCmds[serviceId];
  if (!cmd) {
    return res.status(400).json({ error: `Kan ikke restarte: ${serviceId}` });
  }

  try {
    await execAsync(cmd, { timeout: 30000 });
    res.json({ success: true, message: `${serviceId} restartet` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AbuseIPDB API
// ============================================

// Check IP reputation via AbuseIPDB
app.get('/api/abuseipdb/check/:ip', authenticateToken, async (req, res) => {
  const apiKey = process.env.ABUSEIPDB_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'AbuseIPDB API-nøkkel er ikke konfigurert. Legg den til under Innstillinger.' });
  }

  const { ip } = req.params;
  // Basic IP validation
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    return res.status(400).json({ error: 'Ugyldig IP-adresse' });
  }

  try {
    const response = await axios.get('https://api.abuseipdb.com/api/v2/check', {
      params: {
        ipAddress: ip,
        maxAgeInDays: 90,
        verbose: true,
      },
      headers: {
        Key: apiKey,
        Accept: 'application/json',
      },
    });

    const data = response.data?.data;
    if (!data) {
      return res.status(500).json({ error: 'Ugyldig svar fra AbuseIPDB' });
    }

    res.json({
      ipAddress: data.ipAddress,
      isPublic: data.isPublic,
      abuseConfidenceScore: data.abuseConfidenceScore,
      countryCode: data.countryCode,
      countryName: data.countryName,
      usageType: data.usageType,
      isp: data.isp,
      domain: data.domain,
      isTor: data.isTor,
      totalReports: data.totalReports,
      numDistinctUsers: data.numDistinctUsers,
      lastReportedAt: data.lastReportedAt,
      reports: (data.reports || []).slice(0, 5).map((r) => ({
        reportedAt: r.reportedAt,
        comment: r.comment,
        categories: r.categories,
        reporterCountryCode: r.reporterCountryCode,
      })),
    });
  } catch (error) {
    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'AbuseIPDB rate limit nådd. Prøv igjen senere.' });
    }
    if (error.response?.status === 401 || error.response?.status === 403) {
      return res.status(401).json({ error: 'Ugyldig AbuseIPDB API-nøkkel.' });
    }
    console.error('AbuseIPDB feil:', error.message);
    res.status(500).json({ error: 'Kunne ikke hente data fra AbuseIPDB' });
  }
});

// Test AbuseIPDB connection
app.post('/api/health/test/abuseipdb', authenticateToken, async (req, res) => {
  const apiKey = process.env.ABUSEIPDB_API_KEY;
  if (!apiKey) {
    return res.json({ success: false, message: 'API-nøkkel ikke konfigurert' });
  }
  try {
    const response = await axios.get('https://api.abuseipdb.com/api/v2/check', {
      params: { ipAddress: '8.8.8.8', maxAgeInDays: 1 },
      headers: { Key: apiKey, Accept: 'application/json' },
    });
    if (response.data?.data) {
      res.json({ success: true, message: 'AbuseIPDB tilkoblet OK' });
    } else {
      res.json({ success: false, message: 'Uventet svar fra AbuseIPDB' });
    }
  } catch (error) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      res.json({ success: false, message: 'Ugyldig API-nøkkel' });
    } else {
      res.json({ success: false, message: error.message });
    }
  }
});

// ============================================
// System Update Management
// ============================================

// Check for updates (git fetch + compare)
app.get('/api/system/update/check', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Kun administratorer har tilgang' });
  }

  try {
    const installDir = process.env.INSTALL_DIR || '/opt/netguard';

    // Get current commit info
    const { stdout: currentHash } = await execAsync(`git -C ${installDir} rev-parse HEAD`, { timeout: 10000 });
    const { stdout: currentBranch } = await execAsync(`git -C ${installDir} rev-parse --abbrev-ref HEAD`, { timeout: 5000 });
    const { stdout: currentMsg } = await execAsync(`git -C ${installDir} log -1 --format="%s"`, { timeout: 5000 });
    const { stdout: currentDate } = await execAsync(`git -C ${installDir} log -1 --format="%ci"`, { timeout: 5000 });

    // Fetch latest from remote
    await execAsync(`git -C ${installDir} fetch origin ${currentBranch.trim()}`, { timeout: 30000 });

    // Compare local vs remote
    const { stdout: behindCount } = await execAsync(
      `git -C ${installDir} rev-list --count HEAD..origin/${currentBranch.trim()}`,
      { timeout: 10000 }
    );

    const behind = parseInt(behindCount.trim()) || 0;
    let newCommits = [];

    if (behind > 0) {
      // Get list of new commits
      const { stdout: logOutput } = await execAsync(
        `git -C ${installDir} log --oneline --format="%H|%s|%ci|%an" HEAD..origin/${currentBranch.trim()}`,
        { timeout: 10000 }
      );
      newCommits = logOutput.trim().split('\n').filter(Boolean).map(line => {
        const [hash, message, date, author] = line.split('|');
        return { hash: hash?.substring(0, 7), message, date, author };
      });
    }

    // Get current version tag if available
    let currentVersion = '';
    try {
      const { stdout: tag } = await execAsync(`git -C ${installDir} describe --tags --abbrev=0 2>/dev/null`, { timeout: 5000 });
      currentVersion = tag.trim();
    } catch {
      currentVersion = currentHash.trim().substring(0, 7);
    }

    // Get latest remote version tag
    let latestVersion = '';
    try {
      const { stdout: tag } = await execAsync(`git -C ${installDir} describe --tags --abbrev=0 origin/${currentBranch.trim()} 2>/dev/null`, { timeout: 5000 });
      latestVersion = tag.trim();
    } catch {
      if (behind > 0) {
        const { stdout: remoteHash } = await execAsync(`git -C ${installDir} rev-parse origin/${currentBranch.trim()}`, { timeout: 5000 });
        latestVersion = remoteHash.trim().substring(0, 7);
      } else {
        latestVersion = currentVersion;
      }
    }

    res.json({
      currentVersion,
      latestVersion,
      currentHash: currentHash.trim().substring(0, 7),
      currentMessage: currentMsg.trim(),
      currentDate: currentDate.trim(),
      branch: currentBranch.trim(),
      behind,
      updateAvailable: behind > 0,
      newCommits,
    });
  } catch (error) {
    res.status(500).json({ error: `Kunne ikke sjekke oppdateringer: ${error.message}` });
  }
});

// Apply update (git pull + npm install + rebuild)
app.post('/api/system/update/apply', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Kun administratorer har tilgang' });
  }

  // Use SSE for progress updates
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const sendProgress = (step, message, status = 'running') => {
    res.write(`data: ${JSON.stringify({ step, message, status })}\n\n`);
  };

  try {
    const installDir = process.env.INSTALL_DIR || '/opt/netguard';
    const branch = (req.body?.branch) || 'main';

    // Step 1: Git pull (reset lokale endringer først)
    sendProgress(1, 'Henter siste versjon fra GitHub...');
    await execAsync(`git -C ${installDir} reset --hard HEAD`, { timeout: 30000 });
    const { stdout: pullOutput } = await execAsync(`git -C ${installDir} pull origin ${branch}`, { timeout: 60000 });
    sendProgress(1, `Git pull: ${pullOutput.trim()}`, 'done');

    // Step 2: Install frontend dependencies
    sendProgress(2, 'Installerer frontend-avhengigheter...');
    await execAsync(`cd ${installDir} && npm install --production=false`, { timeout: 120000 });
    sendProgress(2, 'Frontend-avhengigheter installert', 'done');

    // Step 3: Build frontend
    sendProgress(3, 'Bygger frontend...');
    await execAsync(`cd ${installDir} && npm run build`, { timeout: 120000 });
    sendProgress(3, 'Frontend bygget', 'done');

    // Step 4: Update backend dependencies
    sendProgress(4, 'Oppdaterer backend-avhengigheter...');
    const apiDir = process.env.API_DIR || '/opt/netguard-api';
    try {
      await execAsync(`cp -r ${installDir}/backend/* ${apiDir}/`, { timeout: 15000 });
      await execAsync(`cd ${apiDir} && npm install`, { timeout: 60000 });
      sendProgress(4, 'Backend oppdatert', 'done');
    } catch (backendErr) {
      sendProgress(4, `Backend-oppdatering feilet: ${backendErr.message}`, 'warning');
    }

    // Step 5: Restart services
    sendProgress(5, 'Restarter tjenester...');
    try {
      await execAsync('systemctl restart nginx', { timeout: 15000 });
      sendProgress(5, 'Nginx restartet', 'done');
    } catch (nginxErr) {
      sendProgress(5, `Kunne ikke restarte Nginx: ${nginxErr.message}`, 'warning');
    }

    // Final
    sendProgress(6, 'Oppdatering fullført! Backend restarter om 3 sekunder...', 'complete');
    res.end();

    // Restart self after a short delay
    setTimeout(() => {
      try {
        execAsync('systemctl restart netguard-api', { timeout: 10000 });
      } catch {
        process.exit(0); // fallback: systemd will restart
      }
    }, 3000);

  } catch (error) {
    sendProgress(-1, `Oppdatering feilet: ${error.message}`, 'error');
    res.end();
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`NetGuard API kjører på port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log('--- Konfigurerte tjenester ---');
  console.log(`  UniFi: URL=${process.env.UNIFI_CONTROLLER_URL || '(ikke satt)'}, API-key=${process.env.UNIFI_API_KEY ? 'JA (' + process.env.UNIFI_API_KEY.substring(0, 8) + '...)' : 'NEI'}, Auth=${getUnifiAuthMethod() || 'ingen'}`);
  console.log(`  Proxmox: URL=${process.env.PROXMOX_URL || '(ikke satt)'}, User=${process.env.PROXMOX_USER || '(ikke satt)'}, Token=${process.env.PROXMOX_TOKEN_ID || '(ikke satt)'}`);
  console.log(`  TrueNAS: URL=${process.env.TRUENAS_URL || '(ikke satt)'}, API-key=${process.env.TRUENAS_API_KEY ? 'JA' : 'NEI'}`);
  console.log('-----------------------------');
});

/**
 * NetGuard Backend API Server
 * 
 * Proxy-server for å koble frontend til:
 * - UniFi Controller
 * - TrueNAS
 * - Proxmox VE
 * - OpenVAS
 */

require('dotenv').config();
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
      const index = envContent.findIndex(line => line.startsWith(`${key}=`));
      if (index >= 0) {
        envContent[index] = `${key}=${value}`;
      } else {
        envContent.push(`${key}=${value}`);
      }
    };
    
    if (services?.unifi) {
      updateEnv('UNIFI_CONTROLLER_URL', services.unifi.url);
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
        updateEnv('UNIFI_USERNAME', config.username);
        updateEnv('UNIFI_PASSWORD', config.password);
        updateEnv('UNIFI_SITE', config.site);
        break;
      case 'truenas':
        updateEnv('TRUENAS_URL', config.url);
        updateEnv('TRUENAS_API_KEY', config.apiKey);
        break;
      case 'proxmox':
        updateEnv('PROXMOX_URL', config.url);
        updateEnv('PROXMOX_USER', config.user);
        updateEnv('PROXMOX_TOKEN_ID', config.tokenId);
        updateEnv('PROXMOX_TOKEN_SECRET', config.tokenSecret);
        break;
      case 'openvas':
        updateEnv('OPENVAS_URL', config.url);
        updateEnv('OPENVAS_USERNAME', config.username);
        updateEnv('OPENVAS_PASSWORD', config.password);
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

async function unifiLogin() {
  try {
    const response = await axios.post(
      `${process.env.UNIFI_CONTROLLER_URL}/api/login`,
      {
        username: process.env.UNIFI_USERNAME,
        password: process.env.UNIFI_PASSWORD,
      },
      { httpsAgent, withCredentials: true }
    );
    unifiCookie = response.headers['set-cookie'];
    return true;
  } catch (error) {
    console.error('UniFi login feilet:', error.message);
    return false;
  }
}

async function unifiRequest(endpoint) {
  if (!unifiCookie) {
    await unifiLogin();
  }
  
  try {
    const response = await axios.get(
      `${process.env.UNIFI_CONTROLLER_URL}/api/s/${process.env.UNIFI_SITE}${endpoint}`,
      {
        httpsAgent,
        headers: { Cookie: unifiCookie?.join('; ') },
      }
    );
    return response.data;
  } catch (error) {
    // Prøv å logge inn på nytt hvis session er utgått
    if (error.response?.status === 401) {
      await unifiLogin();
      return unifiRequest(endpoint);
    }
    throw error;
  }
}

// UniFi endepunkter
app.get('/api/unifi/alerts', async (req, res) => {
  try {
    const data = await unifiRequest('/stat/ips/event');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/unifi/clients', async (req, res) => {
  try {
    const data = await unifiRequest('/stat/sta');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/unifi/devices', async (req, res) => {
  try {
    const data = await unifiRequest('/stat/device');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/unifi/health', async (req, res) => {
  try {
    const data = await unifiRequest('/stat/health');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Restart AP
app.post('/api/unifi/devices/:mac/restart', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Kun administratorer har tilgang' });
  }
  try {
    if (!unifiCookie) await unifiLogin();
    const response = await axios.post(
      `${process.env.UNIFI_CONTROLLER_URL}/api/s/${process.env.UNIFI_SITE}/cmd/devmgr`,
      { cmd: 'restart', mac: req.params.mac },
      { httpsAgent, headers: { Cookie: unifiCookie?.join('; ') } }
    );
    res.json({ success: true, message: 'Enhet restartes', data: response.data });
  } catch (error) {
    if (error.response?.status === 401) {
      await unifiLogin();
      return res.status(503).json({ error: 'Session utløpt, prøv igjen' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Power cycle a switch port (PoE)
app.post('/api/unifi/devices/:mac/port/:portIdx/cycle', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Kun administratorer har tilgang' });
  }
  try {
    if (!unifiCookie) await unifiLogin();
    const response = await axios.post(
      `${process.env.UNIFI_CONTROLLER_URL}/api/s/${process.env.UNIFI_SITE}/cmd/devmgr`,
      { cmd: 'power-cycle', mac: req.params.mac, port_idx: parseInt(req.params.portIdx) },
      { httpsAgent, headers: { Cookie: unifiCookie?.join('; ') } }
    );
    res.json({ success: true, message: 'Port power-cycled', data: response.data });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
  const response = await axios.get(
    `${process.env.PROXMOX_URL}/api2/json${endpoint}`,
    {
      httpsAgent,
      headers: {
        Authorization: `PVEAPIToken=${process.env.PROXMOX_USER}!${process.env.PROXMOX_TOKEN_ID}=${process.env.PROXMOX_TOKEN_SECRET}`,
      },
    }
  );
  return response.data;
}

app.get('/api/proxmox/nodes', async (req, res) => {
  try {
    const data = await proxmoxRequest('/nodes');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/proxmox/vms', async (req, res) => {
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

app.get('/api/proxmox/containers', async (req, res) => {
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

app.post('/api/proxmox/vms/:node/:vmid/:action', async (req, res) => {
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

// ============================================
// OpenVAS / Greenbone API
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
// Nmap scanning (with streaming support)
// ============================================

const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Streaming Nmap scan with Server-Sent Events
app.get('/api/nmap/scan-stream', (req, res) => {
  const { target, scanType = 'quick' } = req.query;
  
  // Valider target
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
  if (!ipRegex.test(target)) {
    return res.status(400).json({ error: 'Ugyldig mål-format' });
  }
  
  // SSE headers
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
  
  // Send initial event
  res.write(`data: ${JSON.stringify({ type: 'started', target, scanType })}\n\n`);
  
  nmap.stdout.on('data', (data) => {
    const chunk = data.toString();
    xmlOutput += chunk;
    
    // Parse progress from stats
    const statsMatch = chunk.match(/About ([\d.]+)% done/);
    if (statsMatch) {
      res.write(`data: ${JSON.stringify({ type: 'progress', percent: parseFloat(statsMatch[1]) })}\n\n`);
    }
    
    // Count hosts found so far
    const hostMatches = (xmlOutput.match(/<host /g) || []).length;
    if (hostMatches > hostsFound) {
      hostsFound = hostMatches;
      res.write(`data: ${JSON.stringify({ type: 'hosts_update', count: hostsFound })}\n\n`);
    }
  });
  
  nmap.stderr.on('data', (data) => {
    const msg = data.toString();
    // Nmap progress info comes on stderr
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
  
  // Cleanup on client disconnect
  req.on('close', () => {
    nmap.kill();
  });
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
        await axios.get(`${process.env.UNIFI_CONTROLLER_URL}/status`, { 
          httpsAgent, 
          timeout: 10000 
        });
        success = true;
        message = 'UniFi Controller tilgjengelig';
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
  
  // Check UniFi
  if (process.env.UNIFI_CONTROLLER_URL) {
    try {
      const start = Date.now();
      await axios.get(`${process.env.UNIFI_CONTROLLER_URL}/status`, { 
        httpsAgent, 
        timeout: 5000 
      });
      services.push({
        name: 'unifi',
        status: 'online',
        message: 'UniFi Controller tilgjengelig',
        responseTime: Date.now() - start,
      });
    } catch (error) {
      services.push({
        name: 'unifi',
        status: 'offline',
        message: error.message,
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
  
  // Check Proxmox
  if (process.env.PROXMOX_URL) {
    try {
      const start = Date.now();
      await axios.get(`${process.env.PROXMOX_URL}/api2/json/version`, {
        httpsAgent,
        headers: {
          Authorization: `PVEAPIToken=${process.env.PROXMOX_USER}!${process.env.PROXMOX_TOKEN_ID}=${process.env.PROXMOX_TOKEN_SECRET}`,
        },
        timeout: 5000,
      });
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
    await execAsync('docker info', { timeout: 5000 });
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
  
  res.json({
    services,
    system: {
      uptime: days > 0 ? `${days}d ${hours}t` : `${hours}t ${minutes}m`,
      load: os.loadavg(),
      memory: {
        used: os.totalmem() - os.freemem(),
        total: os.totalmem(),
      },
      disk: { used: 0, total: 0 }, // Would need df command for this
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

    // Disk
    let diskTotal = 0, diskUsed = 0;
    try {
      const { stdout } = await execAsync("df -B1 / | tail -1 | awk '{print $2, $3}'", { timeout: 3000 });
      const parts = stdout.trim().split(/\s+/);
      diskTotal = parseInt(parts[0]) || 0;
      diskUsed = parseInt(parts[1]) || 0;
    } catch {}

    res.json({
      os: osVersion,
      hostname,
      uptime,
      kernel: os.release(),
      arch: os.arch(),
      cpu: { model: cpuModel, cores: cpuCores, usage: Math.round(cpuUsage) },
      ram: { total: totalMem, used: usedMem, free: freeMem },
      disk: { total: diskTotal, used: diskUsed },
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
    { id: 'nmap', name: 'Nmap', cmd: 'nmap --version 2>&1 | head -n1', activeCmd: null },
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

// Start server
app.listen(PORT, () => {
  console.log(`NetGuard API kjører på port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

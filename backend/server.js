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

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Ignorer self-signed SSL sertifikater (for UniFi, Proxmox etc.)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

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
app.post('/api/health/test/:service', async (req, res) => {
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

app.get('/api/docker/containers', async (req, res) => {
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

app.post('/api/docker/containers/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    await execAsync(`docker start ${id}`);
    res.json({ success: true, message: 'Container startet' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/docker/containers/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    await execAsync(`docker stop ${id}`);
    res.json({ success: true, message: 'Container stoppet' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/docker/containers/:id/restart', async (req, res) => {
  try {
    const { id } = req.params;
    await execAsync(`docker restart ${id}`);
    res.json({ success: true, message: 'Container restartet' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/docker/containers/:id/logs', async (req, res) => {
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

// Start server
app.listen(PORT, () => {
  console.log(`NetGuard API kjører på port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

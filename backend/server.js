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

// ============================================
// Nmap scanning
// ============================================

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

app.post('/api/nmap/scan', async (req, res) => {
  try {
    const { target, scanType = 'quick' } = req.body;
    
    // Valider target (kun tillat IP-adresser og CIDR)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!ipRegex.test(target)) {
      return res.status(400).json({ error: 'Ugyldig mål-format' });
    }
    
    let nmapArgs = '-sn'; // Default: ping scan
    if (scanType === 'ports') nmapArgs = '-sT -F';
    if (scanType === 'full') nmapArgs = '-sV -sC';
    
    const { stdout } = await execAsync(`nmap ${nmapArgs} ${target} -oX -`, {
      timeout: 300000, // 5 min timeout
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

// Start server
app.listen(PORT, () => {
  console.log(`NetGuard API kjører på port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

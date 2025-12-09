Excellent! Now let's prepare for the **Ubuntu server deployment**. Here's everything you need to modify for production.

## 📋 **Complete Ubuntu Migration Checklist**

### **1. Configuration Changes** (Most Important)

**Update `config/apps.config.json` for Ubuntu Server:**

```json
{
  "apps": [
    {
      "id": "jupyter",
      "name": "Jupyter Notebook",
      "description": "GPU-accelerated coding environment",
      "icon": "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/jupyter.svg",
      "color": "#F37626",
      "launchCommand": "jupyter notebook --no-browser --port=8888 --ip=0.0.0.0 --NotebookApp.token='' --NotebookApp.password='' --NotebookApp.base_url=/jupyter",
      "url": "http://YOUR_SERVER_IP:8888",
      "port": 8888,
      "requiresGPU": true
    },
    {
      "id": "vscode",
      "name": "VS Code Server",
      "description": "Web-based code editor",
      "icon": "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/visualstudiocode.svg",
      "color": "#007ACC",
      "launchCommand": "code-server --bind-addr 0.0.0.0:8080 --auth none --disable-telemetry",
      "url": "http://YOUR_SERVER_IP:8080",
      "port": 8080
    },
    {
      "id": "openwebui",
      "name": "Open WebUI",
      "description": "Chat interface for LLMs",
      "icon": "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/openai.svg",
      "color": "#10A37F",
      "launchCommand": "docker run -d -p 3000:8080 -v open-webui:/app/backend/data -e OLLAMA_BASE_URL=http://host.docker.internal:11434 --name open-webui --restart unless-stopped ghcr.io/open-webui/open-webui:main",
      "url": "http://YOUR_SERVER_IP:3000",
      "port": 3000,
      "requiresDocker": true
    }
  ]
}
```

**Key Ubuntu-specific changes:**
1. **`--ip=0.0.0.0`**: Bind to all network interfaces (not just localhost)
2. **`YOUR_SERVER_IP`**: Replace with server's actual IP (static or domain)
3. **Docker commands**: Use host networking properly
4. **GPU support**: Added flags for GPU applications

### **2. Install Dependencies on Ubuntu**

**SSH into your Ubuntu server and run:**

```bash
# 1. Update system
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js (if not installed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Install PM2 globally for production process management
sudo npm install -g pm2

# 4. Install Python and Jupyter for Ubuntu
sudo apt install -y python3-pip python3-venv
pip3 install notebook jupyterlab

# 5. Install Docker (for OpenWebUI and other containerized apps)
sudo apt install -y docker.io docker-compose
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER  # Add current user to docker group
# LOGOUT AND LOGIN AGAIN for docker group to take effect

# 6. Install code-server (VS Code web version)
curl -fsSL https://code-server.dev/install.sh | sh

# 7. Install firewall and configure ports
sudo apt install -y ufw
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 8050/tcp    # Dashboard
sudo ufw allow 8888/tcp    # Jupyter
sudo ufw allow 8080/tcp    # VS Code
sudo ufw allow 3000/tcp    # OpenWebUI
sudo ufw enable
```

### **3. Production-Ready Server.js Updates**

**Update `server.js` for Ubuntu production:**

```javascript
const express = require('express');
const cors = require('cors');
const launchManager = require('./launch-manager');
const config = require('./config/apps.config.json');
const os = require('os');

const app = express();

// Security middleware for production
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true
}));

app.use(express.json());
app.use(express.static('frontend'));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - ${req.ip}`);
  next();
});

// Health check with system info
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    server: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    uptime: os.uptime(),
    load: os.loadavg(),
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      usage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2) + '%'
    },
    timestamp: new Date().toISOString()
  });
});

// Get all apps with enhanced info
app.get('/api/apps', (req, res) => {
  const appsWithStatus = config.apps.map(app => ({
    ...app,
    serverInfo: {
      ip: process.env.SERVER_IP || getServerIP(),
      hostname: os.hostname()
    }
  }));
  res.json(appsWithStatus);
});

// Launch endpoint
app.post('/api/apps/:id/launch', async (req, res) => {
  try {
    console.log(`Launch request: ${req.params.id} from IP: ${req.ip}`);
    const result = await launchManager.startApp(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Launch error:', error);
    res.status(500).json({ 
      error: error.message,
      code: 'LAUNCH_FAILED'
    });
  }
});

// Status endpoint
app.get('/api/apps/:id/status', async (req, res) => {
  try {
    const status = await launchManager.getAppStatus(req.params.id);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// System monitoring endpoint
app.get('/api/system', (req, res) => {
  res.json({
    cpu: os.cpus(),
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem()
    },
    network: os.networkInterfaces(),
    uptime: os.uptime(),
    userInfo: os.userInfo()
  });
});

// Helper function to get server IP
function getServerIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = process.env.PORT || 8050;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  const serverIP = getServerIP();
  console.log(`=======================================`);
  console.log(`🚀 Production Dashboard Server Started`);
  console.log(`📍 Local:    http://localhost:${PORT}`);
  console.log(`📍 Network:  http://${serverIP}:${PORT}`);
  console.log(`📍 Host:     ${HOST}:${PORT}`);
  console.log(`📊 API:      http://${serverIP}:${PORT}/api/health`);
  console.log(`🕐 Started:  ${new Date().toISOString()}`);
  console.log(`=======================================`);
});
```

### **4. Enhanced Launch Manager for Ubuntu**

**Update `launch-manager.js` for production:**

```javascript
const { exec, spawn } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const config = require('./config/apps.config.json');

class LaunchManager {
  constructor() {
    this.runningApps = new Map();
    this.processes = new Map();
    this.logFile = './logs/launch-manager.log';
    this.initLogging();
  }

  initLogging() {
    const fs = require('fs');
    if (!fs.existsSync('./logs')) {
      fs.mkdirSync('./logs', { recursive: true });
    }
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}\n`;
    
    const fs = require('fs');
    fs.appendFileSync(this.logFile, logMessage);
    console.log(`[${level}] ${message}`);
  }

  async startApp(appId) {
    const app = config.apps.find(a => a.id === appId);
    if (!app) throw new Error(`App ${appId} not found`);

    this.log(`Starting application: ${app.name} (${appId})`);

    // Check if port is already in use
    const portStatus = await this.checkPortInUse(app.port);
    if (portStatus) {
      this.log(`App ${appId} already running on port ${app.port}, PID: ${portStatus.pid}`, 'WARN');
      return {
        status: 'already_running',
        pid: portStatus.pid,
        url: this.resolveUrl(app.url),
        message: `${app.name} is already running`
      };
    }

    try {
      // Check for special requirements
      if (app.requiresGPU) {
        await this.verifyGPU();
      }
      if (app.requiresDocker) {
        await this.verifyDocker();
      }

      let result;
      if (appId === 'jupyter') {
        result = await this.startJupyter(app);
      } else if (appId === 'openwebui') {
        result = await this.startDockerApp(app);
      } else {
        result = await this.startGenericApp(appId, app);
      }

      this.log(`Successfully started ${appId}, PID: ${result.pid}`);
      return result;

    } catch (error) {
      this.log(`Failed to start ${appId}: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  async startJupyter(app) {
    return new Promise((resolve, reject) => {
      this.log(`Starting Jupyter with command: jupyter notebook`);

      // Create logs directory for Jupyter
      const fs = require('fs');
      const jupyterLogDir = './logs/jupyter';
      if (!fs.existsSync(jupyterLogDir)) {
        fs.mkdirSync(jupyterLogDir, { recursive: true });
      }

      const args = [
        'notebook',
        '--no-browser',
        `--port=${app.port}`,
        '--ip=0.0.0.0',
        '--NotebookApp.token=\'\'',
        '--NotebookApp.password=\'\'',
        '--NotebookApp.allow_origin=*',
        '--NotebookApp.disable_check_xsrf=true'
      ];

      const jupyterProcess = spawn('jupyter', args, {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });

      // Log files for Jupyter
      const stdoutLog = fs.createWriteStream(`${jupyterLogDir}/stdout.log`, { flags: 'a' });
      const stderrLog = fs.createWriteStream(`${jupyterLogDir}/stderr.log`, { flags: 'a' });

      jupyterProcess.stdout.pipe(stdoutLog);
      jupyterProcess.stderr.pipe(stderrLog);

      let urlDetected = false;
      let startupTimeout;

      jupyterProcess.stdout.on('data', (data) => {
        const output = data.toString();
        this.log(`Jupyter: ${output.trim()}`);
        
        // Detect Jupyter URL
        if (output.includes('is running at') || output.includes('Use Control-C')) {
          urlDetected = true;
          if (startupTimeout) clearTimeout(startupTimeout);
          
          this.runningApps.set(app.id, jupyterProcess.pid);
          this.processes.set(app.id, jupyterProcess);
          
          resolve({
            status: 'started',
            pid: jupyterProcess.pid,
            url: this.resolveUrl(app.url),
            message: 'Jupyter started successfully'
          });
        }
      });

      jupyterProcess.stderr.on('data', (data) => {
        this.log(`Jupyter ERROR: ${data.toString().trim()}`, 'ERROR');
      });

      // Timeout for startup
      startupTimeout = setTimeout(() => {
        if (!urlDetected) {
          this.runningApps.set(app.id, jupyterProcess.pid);
          this.processes.set(app.id, jupyterProcess);
          
          resolve({
            status: 'started',
            pid: jupyterProcess.pid,
            url: this.resolveUrl(app.url),
            message: 'Jupyter started (waiting for full initialization)'
          });
        }
      }, 5000);

      jupyterProcess.on('error', (error) => {
        reject(new Error(`Jupyter process error: ${error.message}`));
      });
    });
  }

  async startDockerApp(app) {
    this.log(`Starting Docker container: ${app.id}`);
    
    try {
      // Check if container already exists and is running
      const { stdout } = await execPromise(`docker ps -q -f name=${app.id} 2>/dev/null || echo ""`);
      if (stdout.trim()) {
        this.log(`Docker container ${app.id} is already running`);
        return {
          status: 'already_running',
          pid: 0, // Docker containers don't have host PIDs
          url: this.resolveUrl(app.url),
          message: 'Docker container is already running'
        };
      }

      // Start the container
      await execPromise(app.launchCommand);
      
      // Wait for container to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      this.log(`Docker container ${app.id} started successfully`);
      return {
        status: 'started',
        pid: 0,
        url: this.resolveUrl(app.url),
        message: 'Docker container started'
      };
      
    } catch (error) {
      throw new Error(`Docker failed: ${error.message}`);
    }
  }

  async startGenericApp(appId, app) {
    return new Promise((resolve, reject) => {
      this.log(`Starting generic app: ${app.name}`);
      
      const child = spawn('bash', ['-c', app.launchCommand], {
        detached: true,
        stdio: 'ignore'
      });

      child.unref(); // Allow process to continue independently
      
      this.runningApps.set(appId, child.pid);
      this.processes.set(appId, child);

      // Verify process started
      setTimeout(async () => {
        try {
          await execPromise(`ps -p ${child.pid} > /dev/null`);
          resolve({
            status: 'started',
            pid: child.pid,
            url: this.resolveUrl(app.url),
            message: `${app.name} started successfully`
          });
        } catch {
          reject(new Error(`Process ${appId} failed to start`));
        }
      }, 1000);
    });
  }

  async verifyGPU() {
    try {
      const { stdout } = await execPromise('nvidia-smi --query-gpu=name --format=csv,noheader');
      this.log(`GPU detected: ${stdout.trim()}`);
      return true;
    } catch (error) {
      this.log('No NVIDIA GPU detected or nvidia-smi not available', 'WARN');
      return false;
    }
  }

  async verifyDocker() {
    try {
      await execPromise('docker --version');
      this.log('Docker is available');
      return true;
    } catch (error) {
      throw new Error('Docker is not installed or not running');
    }
  }

  async checkPortInUse(port) {
    try {
      const { stdout } = await execPromise(`ss -tlnp | grep :${port} || echo ""`);
      if (stdout.trim()) {
        // Extract PID from ss output
        const match = stdout.match(/pid=(\d+)/);
        const pid = match ? parseInt(match[1]) : null;
        return { pid, port };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async getAppStatus(appId) {
    const app = config.apps.find(a => a.id === appId);
    if (!app) return { status: 'not_found' };

    try {
      const portStatus = await this.checkPortInUse(app.port);
      if (portStatus) {
        return {
          status: 'online',
          pid: portStatus.pid,
          port: app.port,
          url: this.resolveUrl(app.url),
          uptime: await this.getProcessUptime(portStatus.pid)
        };
      }
      return { status: 'offline', port: app.port };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  async getProcessUptime(pid) {
    try {
      const { stdout } = await execPromise(`ps -o etime= -p ${pid} 2>/dev/null || echo ""`);
      return stdout.trim() || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  resolveUrl(urlTemplate) {
    // Replace SERVER_IP with actual IP if needed
    if (urlTemplate.includes('YOUR_SERVER_IP')) {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      for (const name in interfaces) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            return urlTemplate.replace('YOUR_SERVER_IP', iface.address);
          }
        }
      }
    }
    return urlTemplate;
  }
}

module.exports = new LaunchManager();
```

### **5. Enhanced Frontend for Production**

**Update `frontend/dashboard.js` for server deployment:**

```javascript
// Configuration
const CONFIG = {
    SERVER_IP: window.location.hostname,
    AUTO_REFRESH_INTERVAL: 15000, // 15 seconds
    STATUS_CHECK_INTERVAL: 5000   // 5 seconds for launch status
};

// State management
let appState = {
    apps: [],
    status: {},
    systemInfo: null
};

// DOM Elements
const elements = {
    appsGrid: document.getElementById('appsGrid'),
    statusText: document.getElementById('statusText'),
    systemInfo: document.getElementById('systemInfo'),
    serverIP: document.getElementById('serverIP')
};

// Initialize
async function init() {
    console.log('Dashboard initializing...');
    
    // Display server info
    if (elements.serverIP) {
        elements.serverIP.textContent = CONFIG.SERVER_IP;
    }
    
    // Load initial data
    await Promise.all([
        loadApps(),
        loadSystemInfo()
    ]);
    
    // Start auto-refresh
    setInterval(loadApps, CONFIG.AUTO_REFRESH_INTERVAL);
    setInterval(loadSystemInfo, CONFIG.AUTO_REFRESH_INTERVAL * 2);
    
    console.log('Dashboard initialized');
}

// Load apps with status
async function loadApps() {
    try {
        const [appsResponse, healthResponse] = await Promise.all([
            fetch('/api/apps').catch(() => null),
            fetch('/api/health').catch(() => null)
        ]);
        
        if (!appsResponse || !appsResponse.ok) {
            throw new Error('Failed to fetch apps');
        }
        
        const apps = await appsResponse.json();
        appState.apps = apps;
        
        // Update status for each app
        const statusPromises = apps.map(app => 
            fetch(`/api/apps/${app.id}/status`)
                .then(res => res.ok ? res.json() : { status: 'error' })
                .catch(() => ({ status: 'error' }))
        );
        
        const statuses = await Promise.all(statusPromises);
        apps.forEach((app, index) => {
            appState.status[app.id] = statuses[index];
        });
        
        renderApps();
        
        // Update status text
        const onlineCount = Object.values(appState.status).filter(s => s.status === 'online').length;
        elements.statusText.innerHTML = `
            <span class="status-online">● ${onlineCount} online</span> | 
            <span class="status-offline">○ ${apps.length - onlineCount} offline</span> |
            <span class="status-server">Server: ${CONFIG.SERVER_IP}</span>
        `;
        
    } catch (error) {
        console.error('Failed to load apps:', error);
        elements.statusText.textContent = 'Connection error - Retrying...';
        elements.appsGrid.innerHTML = `
            <div class="error-message">
                <h3>⚠️ Connection Error</h3>
                <p>Cannot connect to dashboard server at ${CONFIG.SERVER_IP}</p>
                <button onclick="location.reload()">Retry Connection</button>
            </div>
        `;
    }
}

// Render apps to the grid
function renderApps() {
    elements.appsGrid.innerHTML = '';
    
    appState.apps.forEach(app => {
        const status = appState.status[app.id] || { status: 'unknown' };
        const isOnline = status.status === 'online';
        
        const appCard = document.createElement('div');
        appCard.className = `app-card ${isOnline ? 'online' : 'offline'}`;
        
        // Determine button text and action
        let buttonText, buttonAction, buttonClass;
        if (isOnline) {
            buttonText = 'Open App';
            buttonAction = `openApp('${app.id}')`;
            buttonClass = 'btn-open';
        } else {
            buttonText = 'Launch App';
            buttonAction = `launchApp('${app.id}')`;
            buttonClass = 'btn-launch';
        }
        
        // Resolve URL for display
        const displayUrl = app.url.replace('YOUR_SERVER_IP', CONFIG.SERVER_IP);
        
        appCard.innerHTML = `
            <div class="app-header">
                <div class="app-icon" style="background: ${app.color}">
                    ${getAppIcon(app.id)}
                </div>
                <div class="app-badge ${isOnline ? 'badge-online' : 'badge-offline'}">
                    ${isOnline ? '● Online' : '○ Offline'}
                </div>
            </div>
            <div class="app-body">
                <h3>${app.name}</h3>
                <p class="app-description">${app.description}</p>
                ${app.requiresGPU ? '<span class="gpu-badge">GPU</span>' : ''}
                ${app.requiresDocker ? '<span class="docker-badge">Docker</span>' : ''}
            </div>
            <div class="app-footer">
                <button class="${buttonClass}" onclick="${buttonAction}">
                    ${buttonText}
                </button>
                <div class="app-meta">
                    <small>Port: ${app.port}</small>
                    <small>${displayUrl.replace('http://', '')}</small>
                </div>
            </div>
        `;
        
        elements.appsGrid.appendChild(appCard);
    });
}

// Launch application
async function launchApp(appId) {
    const app = appState.apps.find(a => a.id === appId);
    if (!app) return;
    
    try {
        // Update UI to show launching state
        const button = document.querySelector(`button[onclick*="${appId}"]`);
        if (button) {
            button.disabled = true;
            button.textContent = 'Launching...';
            button.className = 'btn-launching';
        }
        
        elements.statusText.textContent = `Launching ${app.name}...`;
        
        const response = await fetch(`/api/apps/${appId}/launch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.url) {
            // Wait based on app type
            const waitTime = appId === 'jupyter' ? 3000 : 
                            appId === 'openwebui' ? 5000 : 1500;
            
            elements.statusText.innerHTML = `
                <span class="status-launching">🚀 ${app.name} launched!</span>
                <span class="status-countdown" id="countdown">Opening in 3...</span>
            `;
            
            // Countdown before opening
            let countdown = 3;
            const countdownEl = document.getElementById('countdown');
            const countdownInterval = setInterval(() => {
                countdown--;
                if (countdownEl) {
                    countdownEl.textContent = `Opening in ${countdown}...`;
                }
                if (countdown <= 0) {
                    clearInterval(countdownInterval);
                    openApp(appId, result.url);
                }
            }, 1000);
            
            // Also open after waitTime
            setTimeout(() => {
                clearInterval(countdownInterval);
                openApp(appId, result.url);
            }, waitTime);
            
        } else {
            elements.statusText.textContent = `${app.name}: ${result.message || 'Launch failed'}`;
            if (button) {
                button.disabled = false;
                button.textContent = 'Launch App';
                button.className = 'btn-launch';
            }
        }
        
        // Refresh status after launch
        setTimeout(loadApps, 2000);
        
    } catch (error) {
        console.error('Launch failed:', error);
        elements.statusText.textContent = `Error launching ${app.name}: ${error.message}`;
        
        const button = document.querySelector(`button[onclick*="${appId}"]`);
        if (button) {
            button.disabled = false;
            button.textContent = 'Launch App';
            button.className = 'btn-launch';
        }
    }
}

// Open application in new tab
function openApp(appId, url = null) {
    const app = appState.apps.find(a => a.id === appId);
    if (!app) return;
    
    const finalUrl = url || app.url.replace('YOUR_SERVER_IP', CONFIG.SERVER_IP);
    
    // Update status text
    elements.statusText.innerHTML = `
        <span class="status-open">📂 Opening ${app.name}...</span>
        <a href="${finalUrl}" target="_blank" class="app-link">${finalUrl}</a>
    `;
    
    // Open in new tab
    window.open(finalUrl, '_blank');
    
    // Refresh status
    setTimeout(loadApps, 1000);
}

// Load system information
async function loadSystemInfo() {
    try {
        const response = await fetch('/api/system');
        if (response.ok) {
            const data = await response.json();
            appState.systemInfo = data;
            renderSystemInfo();
        }
    } catch (error) {
        // Silently fail for system info
    }
}

function renderSystemInfo() {
    if (!appState.systemInfo || !elements.systemInfo) return;
    
    const { memory, uptime, cpu } = appState.systemInfo;
    const memoryUsage = ((memory.used / memory.total) * 100).toFixed(1);
    const uptimeHours = Math.floor(uptime / 3600);
    const uptimeMinutes = Math.floor((uptime % 3600) / 60);
    
    elements.systemInfo.innerHTML = `
        <div class="system-stats">
            <div class="stat">
                <span class="stat-label">Memory:</span>
                <span class="stat-value">${memoryUsage}% used</span>
            </div>
            <div class="stat">
                <span class="stat-label">Uptime:</span>
                <span class="stat-value">${uptimeHours}h ${uptimeMinutes}m</span>
            </div>
            <div class="stat">
                <span class="stat-label">CPU Cores:</span>
                <span class="stat-value">${cpu.length}</span>
            </div>
        </div>
    `;
}

// Helper function for app icons
function getAppIcon(appId) {
    const icons = {
        jupyter: '📓',
        vscode: '📝',
        openwebui: '🤖',
        test: '🧪'
    };
    return icons[appId] || '🚀';
}

// Add CSS for production styling
const productionStyles = `
    .status-online { color: #4CAF50; font-weight: bold; }
    .status-offline { color: #FF9800; }
    .status-server { color: #2196F3; }
    .status-launching { color: #9C27B0; font-weight: bold; }
    .status-open { color: #3F51B5; }
    .status-countdown { color: #F44336; font-weight: bold; }
    
    .app-card.online { border-left: 4px solid #4CAF50; }
    .app-card.offline { border-left: 4px solid #FF9800; }
    
    .app-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 10px;
    }
    
    .app-badge {
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: bold;
    }
    
    .badge-online {
        background: #4CAF50;
        color: white;
    }
    
    .badge-offline {
        background: #FF9800;
        color: white;
    }
    
    .gpu-badge, .docker-badge {
        display: inline-block;
        padding: 2px 6px;
        margin: 2px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: bold;
    }
    
    .gpu-badge {
        background: #9C27B0;
        color: white;
    }
    
    .docker-badge {
        background: #2496ED;
        color: white;
    }
    
    .btn-launch { background: #FF9800; }
    .btn-launch:hover { background: #F57C00; }
    .btn-open { background: #4CAF50; }
    .btn-open:hover { background: #388E3C; }
    .btn-launching { background: #9C27B0; cursor: wait; }
    
    button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
    
    .app-link {
        color: #2196F3;
        text-decoration: none;
        margin-left: 10px;
    }
    
    .app-link:hover {
        text-decoration: underline;
    }
    
    .error-message {
        grid-column: 1 / -1;
        text-align: center;
        padding: 40px;
        background: #FFEBEE;
        border-radius: 10px;
    }
    
    .system-stats {
        display: flex;
        gap: 20px;
        flex-wrap: wrap;
        margin-top: 10px;
    }
    
    .stat {
        background: #E3F2FD;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 14px;
    }
    
    .stat-label {
        font-weight: bold;
        color: #1976D2;
        margin-right: 5px;
    }
`;

// Inject styles
const styleSheet = document.createElement("style");
styleSheet.textContent = productionStyles;
document.head.appendChild(styleSheet);

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
```

### **6. Production Deployment Script**

Create `deploy.sh` for easy deployment:

```bash
#!/bin/bash
# deploy.sh - Ubuntu Server Deployment Script

set -e  # Exit on error

echo "🚀 Starting Ubuntu Server Deployment"
echo "====================================="

# 1. Check if running on Ubuntu
if [[ ! -f /etc/os-release ]]; then
    echo "❌ This script requires Ubuntu"
    exit 1
fi

source /etc/os-release
if [[ "$ID" != "ubuntu" ]]; then
    echo "❌ This script requires Ubuntu (detected: $ID)"
    exit 1
fi

echo "✅ Ubuntu $VERSION_ID detected"

# 2. Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')
echo "📡 Server IP: $SERVER_IP"

# 3. Install dependencies
echo "📦 Installing system dependencies..."
sudo apt update
sudo apt install -y nodejs npm python3-pip python3-venv docker.io docker-compose ufw

# 4. Configure firewall
echo "🔥 Configuring firewall..."
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 8050/tcp    # Dashboard
sudo ufw allow 8888/tcp    # Jupyter
sudo ufw allow 8080/tcp    # VS Code
sudo ufw allow 3000/tcp    # OpenWebUI
sudo ufw --force enable

# 5. Install Python packages
echo "🐍 Installing Python packages..."
pip3 install notebook jupyterlab

# 6. Install Node.js packages globally
echo "📦 Installing Node.js packages..."
sudo npm install -g pm2

# 7. Create application directory
echo "📁 Setting up application directory..."
APP_DIR="/opt/app-dashboard"
sudo mkdir -p $APP_DIR
sudo chown -R $USER:$USER $APP_DIR

# 8. Copy application files (assumes you're in the project directory)
echo "📄 Copying application files..."
cp -r . $APP_DIR/
cd $APP_DIR

# 9. Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install

# 10. Update configuration with server IP
echo "⚙️ Updating configuration..."
sed -i "s/YOUR_SERVER_IP/$SERVER_IP/g" config/apps.config.json

# 11. Create logs directory
mkdir -p logs

# 12. Create systemd service for PM2
echo "🎯 Setting up PM2 service..."
pm2 start server.js --name app-dashboard
pm2 save
pm2 startup systemd -u $USER --hp /home/$USER

# 13. Create environment file
echo "🌍 Creating environment configuration..."
cat > .env << EOF
NODE_ENV=production
PORT=8050
HOST=0.0.0.0
SERVER_IP=$SERVER_IP
ALLOWED_ORIGINS=http://$SERVER_IP:8050,http://localhost:8050
EOF

# 14. Set permissions
sudo chmod -R 755 $APP_DIR

echo "====================================="
echo "✅ Deployment Complete!"
echo ""
echo "📊 Dashboard URL: http://$SERVER_IP:8050"
echo "📓 Jupyter URL:   http://$SERVER_IP:8888"
echo "💻 VS Code URL:   http://$SERVER_IP:8080"
echo "🤖 OpenWebUI URL: http://$SERVER_IP:3000"
echo ""
echo "🔧 Management Commands:"
echo "   pm2 status                 # Check app status"
echo "   pm2 logs app-dashboard     # View logs"
echo "   pm2 restart app-dashboard  # Restart dashboard"
echo ""
echo "📝 Next steps:"
echo "   1. Access the dashboard at http://$SERVER_IP:8050"
echo "   2. Configure DNS if you have a domain name"
echo "   3. Set up SSL certificates for HTTPS"
echo "   4. Configure authentication if needed"
echo "====================================="
```

Make it executable:
```bash
chmod +x deploy.sh
```

### **7. Quick Migration Commands**

**From your Mac to Ubuntu Server:**

```bash
# 1. Copy files to server (from your Mac)
scp -r ./app-dashboard user@your-server-ip:/tmp/

# 2. SSH into server
ssh user@your-server-ip

# 3. On server, move files to final location
sudo mv /tmp/app-dashboard /opt/
cd /opt/app-dashboard

# 4. Run deployment script
chmod +x deploy.sh
./deploy.sh
```

### **8. Post-Deployment Verification**

**Check everything is working:**

```bash
# 1. Check services
pm2 status
systemctl status pm2-$USER

# 2. Check ports
sudo netstat -tulpn | grep -E ':8050|:8888|:8080|:3000'

# 3. Test API
curl http://localhost:8050/api/health
curl http://localhost:8050/api/apps

# 4. Check logs
pm2 logs app-dashboard
tail -f logs/launch-manager.log
```

### **9. Important Security Notes for Production**

1. **Change default passwords** in Jupyter config
2. **Enable authentication** for production:
   ```javascript
   // Add to server.js
   const basicAuth = require('express-basic-auth');
   app.use(basicAuth({
     users: { 'admin': 'secure-password-here' },
     challenge: true
   }));
   ```
3. **Setup SSL/HTTPS** with Nginx reverse proxy
4. **Configure backups** for important data
5. **Monitor resources** with tools like `htop`, `nvidia-smi`

### **10. Maintenance Commands**

```bash
# Update the dashboard
cd /opt/app-dashboard
git pull  # if using git
npm install
pm2 restart app-dashboard

# View real-time logs
pm2 logs app-dashboard --lines 100

# Check GPU status
nvidia-smi

# Monitor system
htop
df -h
```

**That's it!** Your dashboard is now ready for production on Ubuntu. The main changes are:

1. **Network binding** (`0.0.0.0` instead of `localhost`)
2. **Production process management** (PM2 with systemd)
3. **Security hardening** (firewall, user permissions)
4. **Enhanced logging** and monitoring
5. **GPU and Docker support** for your L40S server

Test each app on the server and let me know if you encounter any Ubuntu-specific issues!
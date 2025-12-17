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
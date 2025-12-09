# 🚀 Application Dashboard for GPU Servers

A production-ready web dashboard for managing and launching applications (Jupyter, VS Code, OpenWebUI, etc.) on Ubuntu servers with NVIDIA GPUs. Students can remotely access and launch applications through a clean web interface.

## ✨ Features

- **📱 Web Dashboard**: Clean, responsive interface accessible from any browser
- **🚀 One-Click Launch**: Start applications with a single click
- **📊 Real-time Status**: See which apps are running/stopped
- **🔗 Direct Access**: Opens applications in new tabs automatically
- **⚡ GPU Ready**: Optimized for NVIDIA L40S GPUs
- **🐳 Docker Support**: Built-in container management
- **🛡️ Production Ready**: Security, logging, and process management

## 🏗️ Architecture

```
app-dashboard/
├── server.js              # Express API server
├── launch-manager.js      # Application process manager
├── config/
│   └── apps.config.json   # Application definitions
├── frontend/
│   ├── index.html         # Dashboard UI
│   ├── style.css          # Styles
│   └── dashboard.js       # Frontend logic
├── logs/                  # Application logs
└── package.json
```

## 🚀 Quick Start

### Prerequisites
- Ubuntu 20.04/22.04 LTS
- Node.js 16+
- Python 3.8+
- Docker (for containerized apps)
- NVIDIA GPU drivers (for GPU-accelerated apps)

### Installation

1. **Clone and setup:**
```bash
git clone <repository-url>
cd app-dashboard
npm install
```

2. **Configure applications:**
Edit `config/apps.config.json` with your server IP:
```json
{
  "apps": [
    {
      "id": "jupyter",
      "name": "Jupyter Notebook",
      "launchCommand": "jupyter notebook --no-browser --port=8888 --ip=0.0.0.0",
      "url": "http://YOUR_SERVER_IP:8888",
      "port": 8888
    }
  ]
}
```

3. **Install system dependencies:**
```bash
# Run the setup script
chmod +x setup.sh
./setup.sh
```

4. **Start the dashboard:**
```bash
# Development mode
npm run dev

# Production mode with PM2
npm start
```

5. **Access the dashboard:**
Open `http://YOUR_SERVER_IP:8050` in your browser

## 📦 Supported Applications

### Pre-configured Applications

| Application | Port | Description | Requirements |
|------------|------|-------------|--------------|
| **Jupyter Notebook** | 8888 | Interactive coding environment | Python, GPU optional |
| **VS Code Server** | 8080 | Web-based code editor | code-server |
| **Open WebUI** | 3000 | Chat interface for LLMs | Docker, Ollama |
| **Custom Apps** | Any | Add your own applications | Define in config |

### Adding New Applications

1. Edit `config/apps.config.json`:
```json
{
  "id": "myapp",
  "name": "My Application",
  "description": "Application description",
  "icon": "https://...",
  "color": "#HEXCODE",
  "launchCommand": "command-to-start",
  "url": "http://SERVER_IP:PORT",
  "port": PORT
}
```

2. Restart the dashboard:
```bash
pm2 restart app-dashboard
```

## 🔧 Configuration

### Environment Variables

Create `.env` file:
```bash
NODE_ENV=production
PORT=8050
HOST=0.0.0.0
SERVER_IP=your.server.ip
ALLOWED_ORIGINS=http://your.server.ip:8050
```

### Application Configuration

Key fields in `apps.config.json`:
- `id`: Unique identifier
- `launchCommand`: Shell command to start the app
- `url`: Access URL (use `YOUR_SERVER_IP` placeholder)
- `port`: Network port
- `requiresGPU`: Set to `true` for GPU applications
- `requiresDocker`: Set to `true` for Docker containers

## 🚀 Deployment

### Production Deployment

1. **Server setup:**
```bash
# Run deployment script
./deploy.sh
```

2. **Configure firewall:**
```bash
sudo ufw allow 8050/tcp  # Dashboard
sudo ufw allow 8888/tcp  # Jupyter
sudo ufw allow 8080/tcp  # VS Code
sudo ufw allow 3000/tcp  # OpenWebUI
```

3. **Setup as system service:**
```bash
pm2 start server.js --name app-dashboard
pm2 save
pm2 startup systemd
```

### Docker Deployment (Alternative)

```bash
# Build and run with Docker
docker build -t app-dashboard .
docker run -d -p 8050:8050 -v ./config:/app/config app-dashboard
```

## 📊 Monitoring & Maintenance

### Check Status
```bash
# Dashboard status
pm2 status app-dashboard

# Application logs
pm2 logs app-dashboard
tail -f logs/launch-manager.log

# Port usage
sudo netstat -tulpn | grep -E ':8050|:8888|:8080|:3000'
```

### Common Commands
```bash
# Restart dashboard
pm2 restart app-dashboard

# Update application list
# Edit config/apps.config.json then:
pm2 restart app-dashboard

# View real-time GPU usage
nvidia-smi -l 1

# Check system resources
htop
df -h
```

## 🛡️ Security Considerations

### Production Security Checklist

1. **Enable authentication:**
```javascript
// In server.js
app.use(basicAuth({
  users: { 'admin': 'secure-password' },
  challenge: true
}));
```

2. **Setup HTTPS:**
   - Use Nginx reverse proxy with Let's Encrypt
   - Redirect HTTP to HTTPS

3. **Configure Jupyter security:**
```bash
# Generate hashed password
jupyter notebook password

# Use tokens instead of passwordless access
jupyter notebook --NotebookApp.token='your-token'
```

4. **Network security:**
   - Restrict access with firewall rules
   - Use VPN for internal access
   - Configure allowed IP ranges

### User Management
For multi-user environments, consider:
- Implementing user sessions
- Per-user application instances
- Resource quotas and limits
- Usage tracking and logging

## 🔍 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **Port already in use** | Change port in config or kill process: `sudo lsof -ti:PORT \| xargs kill -9` |
| **Jupyter won't start** | Check Python environment: `which jupyter` |
| **Docker permission denied** | Add user to docker group: `sudo usermod -aG docker $USER` |
| **Dashboard not accessible** | Check firewall: `sudo ufw status` |
| **GPU not detected** | Verify drivers: `nvidia-smi` |

### Debug Mode
```bash
# Start with verbose logging
DEBUG=* node server.js

# Check specific component
DEBUG=launch-manager node server.js
```

### Log Files
- `logs/launch-manager.log` - Application launch logs
- `logs/jupyter/` - Jupyter server logs
- PM2 logs: `pm2 logs app-dashboard`

## 📈 Performance Optimization

### For GPU Applications
1. **Monitor GPU memory:**
```bash
watch -n 1 nvidia-smi
```

2. **Set resource limits:**
```javascript
// In app config
"launchCommand": "jupyter notebook --ResourceUseDisplay.track_cpu_per_process=true"
```

3. **Enable GPU sharing** (for multiple users):
```bash
# Configure MIG for L40S
sudo nvidia-smi -mig 1
```

### Dashboard Optimization
1. **Enable caching** for static assets
2. **Compress responses** with gzip
3. **Use CDN** for icon assets
4. **Implement pagination** for many applications

## 🔄 Updating

### Update Procedure
1. **Backup configuration:**
```bash
cp config/apps.config.json config/apps.config.json.backup
```

2. **Update code:**
```bash
git pull
npm install
```

3. **Restart services:**
```bash
pm2 restart app-dashboard
```

4. **Verify:**
```bash
curl http://localhost:8050/api/health
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

### Development
```bash
# Install dev dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test
```

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- Built with Node.js, Express, and PM2
- Icons from Simple Icons
- Inspired by JupyterHub and code-server

## 📞 Support

For issues and questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review logs in `logs/` directory
3. Open a GitHub issue with:
   - Error messages
   - Server configuration
   - Steps to reproduce

---

**Happy Coding!** 🎉
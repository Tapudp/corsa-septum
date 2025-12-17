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
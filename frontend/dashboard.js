// Configuration
const CONFIG = {
    SERVER_IP: window.location.hostname,
    AUTO_REFRESH_INTERVAL: 15000,
    STATUS_CHECK_INTERVAL: 5000
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
    
    if (elements.serverIP) {
        elements.serverIP.textContent = CONFIG.SERVER_IP;
    }
    
    await Promise.all([loadApps(), loadSystemInfo()]);
    
    // Start auto-refresh
    setInterval(loadApps, CONFIG.AUTO_REFRESH_INTERVAL);
    setInterval(loadSystemInfo, CONFIG.AUTO_REFRESH_INTERVAL * 2);
    
    console.log('Dashboard initialized');
}

// Load apps with status
async function loadApps() {
    try {
        const [appsResponse] = await Promise.all([
            fetch('/api/apps').catch(() => null),
            fetch('/api/health').catch(() => null)
        ]);
        
        if (!appsResponse || !appsResponse.ok) {
            throw new Error('Failed to fetch apps');
        }
        
        const apps = await appsResponse.json();
        appState.apps = apps;

        // Get status for each app
        const statusPromises = apps.map(async (app) => {
            const status = await checkAppStatusWithRetry(app.id, 2);
            return { appId: app.id, status };
        });
        
        const statuses = await Promise.all(statusPromises);
        
        // Update app state
        apps.forEach((app, index) => {
            appState.status[app.id] = statuses[index].status;
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

// Helper: Check app status with retry
async function checkAppStatusWithRetry(appId, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(`/api/apps/${appId}/status`);
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.log(`Status check attempt ${i + 1} failed for ${appId}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
    return { status: 'error' };
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
            <div class="app-badge ${isOnline ? 'badge-online' : 'badge-offline'}">
                ${isOnline ? '● Online' : '○ Offline'}
            </div>
            <div class="app-icon" style="background: ${app.color}">
                ${getAppIcon(app.id)}
            </div>
            <div class="app-body">
                <h3>${app.name}</h3>
                <p class="app-description">${app.description}</p>
                ${app.requiresGPU ? '<span class="gpu-badge">GPU</span>' : ''}
                ${app.requiresDocker ? '<span class="docker-badge">Docker</span>' : ''}
            </div>
            <div class="app-footer">
                <button class="${buttonClass}" onclick="${buttonAction}" id="btn-${app.id}">
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
    
    const button = document.getElementById(`btn-${appId}`);
    
    try {
        // Update UI to show launching state
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
            elements.statusText.innerHTML = `
                <span class="status-launching">🚀 ${app.name} launched!</span>
                <span class="status-countdown">Opening in 3 seconds...</span>
            `;
            
            // Wait for Jupyter to fully start
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Open the app
            openApp(appId, result.url);
            
        } else {
            elements.statusText.textContent = `${app.name}: ${result.message || 'Launch failed'}`;
            if (button) {
                button.disabled = false;
                button.textContent = 'Launch App';
                button.className = 'btn-launch';
            }
        }
        
        // Refresh status after launch (immediate + delayed)
        setTimeout(loadApps, 1000);
        setTimeout(loadApps, 5000); // Additional check after 5 seconds
        
    } catch (error) {
        console.error('Launch failed:', error);
        elements.statusText.textContent = `Error launching ${app.name}: ${error.message}`;
        
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
    
    elements.statusText.innerHTML = `
        <span class="status-open">📂 Opening ${app.name}...</span>
        <a href="${finalUrl}" target="_blank" class="app-link">${finalUrl}</a>
    `;
    
    window.open(finalUrl, '_blank');
    
    // Refresh status after opening
    setTimeout(loadApps, 2000);
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

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
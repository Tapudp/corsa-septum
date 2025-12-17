const { exec, spawn } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const config = require('./config/apps.config.json');

class LaunchManager {
  constructor() {
    this.runningApps = new Map(); // appId -> { pid, startTime, lastChecked }
    this.processes = new Map(); // appId -> child process
    this.healthCheckInterval = 30000; // Check every 30 seconds
    this.initHealthChecker();
  }

  // Initialize automatic health checking
  initHealthChecker() {
    setInterval(async () => {
      for (const [appId, appInfo] of this.runningApps.entries()) {
        const isAlive = await this.isProcessAlive(appInfo.pid, appId);
        if (!isAlive) {
          console.log(`Health check: App ${appId} (PID: ${appInfo.pid}) is dead, removing from running apps`);
          this.runningApps.delete(appId);
          this.processes.delete(appId);
        }
      }
    }, this.healthCheckInterval);
  }

  async isProcessAlive(pid, appId) {
    const app = config.apps.find(a => a.id === appId);
    if (!app) return false;

    try {
      // Method 1: Check if process exists
      await execPromise(`kill -0 ${pid} 2>/dev/null`);
      
      // Method 2: Check if port is actually listening
      const { stdout } = await execPromise(`ss -tlnp 2>/dev/null | grep ":${app.port}" | grep "pid=${pid}" || echo ""`);
      
      if (stdout.trim()) {
        // Process exists AND port is listening
        return true;
      } else {
        // Process exists but port not listening - might be zombie
        console.log(`Process ${pid} exists but port ${app.port} not listening`);
        return false;
      }
    } catch (error) {
      // Process doesn't exist
      return false;
    }
  }

  async startApp(appId) {
    const app = config.apps.find(a => a.id === appId);
    if (!app) throw new Error(`App ${appId} not found`);

    console.log(`Starting application: ${app.name} (${appId}) on port ${app.port}`);

    // Check if port is already in use (more reliable check)
    const portStatus = await this.isPortInUse(app.port);
    if (portStatus) {
      console.log(`Port ${app.port} is in use by PID ${portStatus.pid}`);
      
      // Verify the process on that port is actually the expected app
      const isExpectedApp = await this.verifyProcessIsApp(portStatus.pid, appId);
      
      if (isExpectedApp) {
        // Update our tracking
        this.runningApps.set(appId, {
          pid: portStatus.pid,
          startTime: Date.now(),
          lastChecked: Date.now()
        });
        
        return {
          status: 'already_running',
          pid: portStatus.pid,
          url: app.url,
          message: `${app.name} is already running on port ${app.port}`
        };
      } else {
        // Port is used by something else
        throw new Error(`Port ${app.port} is in use by another process (PID: ${portStatus.pid})`);
      }
    }

    try {
      let result;
      if (appId === 'jupyter') {
        result = await this.startJupyter(app);
      } else {
        result = await this.startGenericApp(appId, app);
      }

      console.log(`Successfully started ${appId}, PID: ${result.pid}`);
      return result;

    } catch (error) {
      console.error(`Failed to start ${appId}:`, error);
      throw error;
    }
  }

  async startJupyter(app) {
    return new Promise((resolve, reject) => {
      console.log(`Starting Jupyter on port ${app.port}`);

      // IMPORTANT: Use the exact command from your config
      // Note: I changed port to 8889 to match your config
      const args = [
        'notebook',
        '--no-browser',
        `--port=${app.port}`,
        '--ip=0.0.0.0',
        '--NotebookApp.token=\'\'',
        '--NotebookApp.password=\'\'',
        '--NotebookApp.base_url=/jupyter',
        '--NotebookApp.allow_origin=*'
      ];

      const jupyterProcess = spawn('jupyter', args, {
        detached: false, // Keep it attached so we can track it
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Store process reference
      this.processes.set(app.id, jupyterProcess);
      
      let urlDetected = false;
      let startupTimeout;
      let output = '';

      jupyterProcess.stdout.on('data', (data) => {
        const line = data.toString();
        output += line;
        console.log(`Jupyter: ${line.trim()}`);
        
        // Detect Jupyter URL - look for the "is running at" message
        if (line.includes('is running at') || line.includes('Use Control-C')) {
          urlDetected = true;
          if (startupTimeout) clearTimeout(startupTimeout);
          
          this.runningApps.set(app.id, {
            pid: jupyterProcess.pid,
            startTime: Date.now(),
            lastChecked: Date.now()
          });
          
          resolve({
            status: 'started',
            pid: jupyterProcess.pid,
            url: app.url,
            message: 'Jupyter started successfully'
          });
        }
      });

      jupyterProcess.stderr.on('data', (data) => {
        console.error(`Jupyter ERROR: ${data.toString().trim()}`);
      });

      // Handle process exit
      jupyterProcess.on('exit', (code) => {
        console.log(`Jupyter process exited with code ${code}`);
        this.runningApps.delete(app.id);
        this.processes.delete(app.id);
      });

      jupyterProcess.on('error', (error) => {
        console.error('Jupyter spawn error:', error);
        reject(new Error(`Jupyter process error: ${error.message}`));
      });

      // Timeout for startup (10 seconds)
      startupTimeout = setTimeout(() => {
        if (!urlDetected) {
          console.log('Jupyter startup timeout, but process is running');
          this.runningApps.set(app.id, {
            pid: jupyterProcess.pid,
            startTime: Date.now(),
            lastChecked: Date.now()
          });
          
          resolve({
            status: 'started',
            pid: jupyterProcess.pid,
            url: app.url,
            message: 'Jupyter started (timeout, assuming running)'
          });
        }
      }, 10000);
    });
  }

  async startGenericApp(appId, app) {
    return new Promise((resolve, reject) => {
      console.log(`Starting generic app: ${app.name} on port ${app.port}`);
      
      const child = spawn('bash', ['-c', app.launchCommand], {
        detached: false,
        stdio: 'ignore'
      });

      // Track process exit
      child.on('exit', (code) => {
        console.log(`App ${appId} process exited with code ${code}`);
        this.runningApps.delete(appId);
        this.processes.delete(appId);
      });

      child.on('error', (error) => {
        console.error(`App ${appId} spawn error:`, error);
        this.runningApps.delete(appId);
        this.processes.delete(appId);
      });

      // Store references
      this.processes.set(appId, child);
      this.runningApps.set(appId, {
        pid: child.pid,
        startTime: Date.now(),
        lastChecked: Date.now()
      });

      // Wait a moment, then verify it's actually running
      setTimeout(async () => {
        try {
          const isAlive = await this.isProcessAlive(child.pid, appId);
          if (isAlive) {
            resolve({
              status: 'started',
              pid: child.pid,
              url: app.url,
              message: `${app.name} started successfully`
            });
          } else {
            this.runningApps.delete(appId);
            this.processes.delete(appId);
            reject(new Error(`Process ${appId} failed to start or died immediately`));
          }
        } catch (error) {
          this.runningApps.delete(appId);
          this.processes.delete(appId);
          reject(error);
        }
      }, 1500);
    });
  }

  async isPortInUse(port) {
    try {
      // Using ss instead of netstat (more modern)
      const { stdout } = await execPromise(`ss -tlnp 2>/dev/null | grep ":${port}" || echo ""`);
      
      if (stdout.trim()) {
        // Extract PID from output
        const pidMatch = stdout.match(/pid=(\d+)/);
        const pid = pidMatch ? parseInt(pidMatch[1]) : null;
        
        if (pid) {
          // Verify PID is actually running
          try {
            await execPromise(`ps -p ${pid} > /dev/null 2>&1`);
            return { pid: pid, port: port };
          } catch {
            // PID doesn't exist
            return null;
          }
        }
      }
      return null;
    } catch (error) {
      console.error(`Error checking port ${port}:`, error);
      return null;
    }
  }

  async verifyProcessIsApp(pid, appId) {
    try {
      // Get the command line of the process
      const { stdout } = await execPromise(`ps -p ${pid} -o command= 2>/dev/null || echo ""`);
      const app = config.apps.find(a => a.id === appId);
      
      if (!app) return false;
      
      // Check if it's our Jupyter process
      if (appId === 'jupyter') {
        return stdout.includes('jupyter') && stdout.includes(`port=${app.port}`);
      }
      
      // For other apps, check if command matches
      return stdout.includes(app.launchCommand.split(' ')[0]);
    } catch {
      return false;
    }
  }

  async getAppStatus(appId) {
    const app = config.apps.find(a => a.id === appId);
    if (!app) return { status: 'not_found' };

    try {
      // First check if we think it's running
      const trackedApp = this.runningApps.get(appId);
      
      if (trackedApp) {
        // Verify it's actually still alive
        const isAlive = await this.isProcessAlive(trackedApp.pid, appId);
        
        if (isAlive) {
          return {
            status: 'online',
            pid: trackedApp.pid,
            port: app.port,
            url: app.url,
            uptime: Date.now() - trackedApp.startTime
          };
        } else {
          // Clean up dead entry
          this.runningApps.delete(appId);
          this.processes.delete(appId);
          return { status: 'offline', port: app.port };
        }
      }
      
      // Not in our tracking, but maybe it's running externally
      const portStatus = await this.isPortInUse(app.port);
      if (portStatus) {
        // Found a process on our port - track it
        this.runningApps.set(appId, {
          pid: portStatus.pid,
          startTime: Date.now() - 60000, // Assume started 1 min ago
          lastChecked: Date.now()
        });
        
        return {
          status: 'online',
          pid: portStatus.pid,
          port: app.port,
          url: app.url,
          uptime: 60000 // 1 minute
        };
      }
      
      return { status: 'offline', port: app.port };
      
    } catch (error) {
      console.error(`Error getting status for ${appId}:`, error);
      return { status: 'error', error: error.message };
    }
  }
}

module.exports = new LaunchManager();
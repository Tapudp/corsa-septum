// launch-manager.js - UPDATED VERSION
const { exec, spawn } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);
const config = require("./config/apps.config.json");

class LaunchManager {
  constructor() {
    this.runningApps = new Map(); // Track running apps
    this.processes = new Map(); // Keep reference to spawned processes
  }

  async startApp(appId) {
    const app = config.apps.find((a) => a.id === appId);
    if (!app) throw new Error(`App ${appId} not found`);

    // Check if already running
    try {
      const status = await this.checkPortInUse(app.port);
      if (status) {
        return {
          status: "already_running",
          pid: status.pid,
          url: app.url,
          message: `${app.name} is already running on port ${app.port}`,
        };
      }
    } catch (error) {
      console.log(`Port check for ${appId}: ${error.message}`);
    }

    try {
      console.log(`Starting ${appId} with command: ${app.launchCommand}`);

      // Special handling for Jupyter - it needs proper signal handling
      if (appId === "jupyter") {
        return await this.startJupyter(app);
      }

      // For other apps
      return await this.startGenericApp(appId, app);
    } catch (error) {
      throw new Error(`Failed to start ${appId}: ${error.message}`);
    }
  }

  async startJupyter(app) {
    return new Promise((resolve, reject) => {
      // Split command into parts for spawn
      const args = app.launchCommand.split(" ").slice(1);
      const jupyterProcess = spawn("jupyter", args, {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      // Store process reference
      this.processes.set(app.id, jupyterProcess);

      let output = "";
      let urlDetected = false;

      // Capture output to detect when Jupyter is ready
      jupyterProcess.stdout.on("data", (data) => {
        output += data.toString();
        console.log(`Jupyter stdout: ${data.toString().trim()}`);

        // Check for the "is ready at" message
        if (data.toString().includes("is ready at")) {
          urlDetected = true;
          this.runningApps.set(app.id, jupyterProcess.pid);

          resolve({
            status: "started",
            pid: jupyterProcess.pid,
            url: app.url,
            message: "Jupyter started successfully",
          });
        }
      });

      jupyterProcess.stderr.on("data", (data) => {
        console.error(`Jupyter stderr: ${data.toString().trim()}`);
      });

      jupyterProcess.on("error", (error) => {
        reject(new Error(`Jupyter process error: ${error.message}`));
      });

      // Timeout in case we don't detect the URL
      setTimeout(() => {
        if (!urlDetected) {
          this.runningApps.set(app.id, jupyterProcess.pid);
          resolve({
            status: "started",
            pid: jupyterProcess.pid,
            url: app.url,
            message: "Jupyter started (URL detection timeout)",
          });
        }
      }, 3000);
    });
  }

  async startGenericApp(appId, app) {
    return new Promise((resolve, reject) => {
      const child = exec(app.launchCommand, (error, stdout, stderr) => {
        if (error && !error.killed) {
          reject(error);
        }
      });

      // Store the process
      this.processes.set(appId, child);
      this.runningApps.set(appId, child.pid);

      // Detach process so it continues running
      child.unref();

      // Wait a moment for app to start
      setTimeout(() => {
        resolve({
          status: "started",
          pid: child.pid,
          url: app.url,
          message: `${app.name} started successfully`,
        });
      }, 1000);
    });
  }

  async checkPortInUse(port) {
    try {
      // Mac/Linux command to find process using a port
      const { stdout } = await execPromise(
        `lsof -ti:${port} 2>/dev/null || echo ""`
      );
      const pid = stdout.trim();

      if (pid) {
        return { pid: parseInt(pid), port: port };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async getAppStatus(appId) {
    const app = config.apps.find((a) => a.id === appId);
    if (!app) return { status: "not_found" };

    try {
      const portStatus = await this.checkPortInUse(app.port);
      if (portStatus) {
        return {
          status: "online",
          pid: portStatus.pid,
          port: app.port,
          url: app.url,
        };
      }
      return { status: "stopped", port: app.port };
    } catch (error) {
      return { status: "error", error: error.message };
    }
  }
}

module.exports = new LaunchManager();

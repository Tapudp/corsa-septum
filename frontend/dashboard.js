async function loadApps() {
  try {
    const response = await fetch("/api/apps");
    const apps = await response.json();

    const grid = document.getElementById("appsGrid");
    grid.innerHTML = "";

    for (const app of apps) {
      // Get status for each app
      const statusResponse = await fetch(`/api/apps/${app.id}/status`);
      const status = await statusResponse.json();

      const appCard = document.createElement("div");
      appCard.className = "app-card";
      appCard.innerHTML = `
                <div class="app-icon" style="background: ${app.color}">
                    ${
                      app.icon
                        ? `<img src="${app.icon}" width="30" height="30">`
                        : "🚀"
                    }
                </div>
                <h3>${app.name}</h3>
                <p>${app.description}</p>
                <div class="status-indicator" style="background: ${
                  status.status === "online" ? "#4CAF50" : "#FF9800"
                }">
                    ${status.status === "online" ? "● Online" : "○ Offline"}
                </div>
                <button onclick="launchApp('${app.id}')" ${
        status.status === "online" ? 'style="background: #4CAF50;"' : ""
      }>
                    ${status.status === "online" ? "Open App" : "Launch App"}
                </button>
                <small>Port: ${app.port}</small>
            `;
      grid.appendChild(appCard);
    }

    document.getElementById(
      "statusText"
    ).textContent = `Loaded ${apps.length} applications`;
  } catch (error) {
    console.error("Failed to load apps:", error);
    document.getElementById("statusText").textContent = "Error loading apps";
  }
}

async function launchApp(appId) {
  try {
    document.getElementById("statusText").textContent = `Launching ${appId}...`;

    const response = await fetch(`/api/apps/${appId}/launch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const result = await response.json();

    if (result.url) {
      // Wait a moment for Jupyter to fully start
      if (appId === "jupyter") {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Open the app in new tab
      window.open(result.url, "_blank");
      document.getElementById(
        "statusText"
      ).textContent = `${appId} launched! Opening ${result.url}`;

      // Reload apps to update status
      setTimeout(loadApps, 1000);
    } else {
      document.getElementById("statusText").textContent = `${appId}: ${
        result.message || result.status
      }`;
    }
  } catch (error) {
    console.error("Launch failed:", error);
    document.getElementById(
      "statusText"
    ).textContent = `Error: ${error.message}`;
  }
}

// Add CSS for status indicator
const style = document.createElement("style");
style.textContent = `
    .status-indicator {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 12px;
        color: white;
        font-size: 12px;
        margin-bottom: 10px;
    }
    button:disabled {
        background: #cccccc !important;
        cursor: not-allowed;
    }
`;
document.head.appendChild(style);

// Load apps when page loads
document.addEventListener("DOMContentLoaded", loadApps);

// Auto-refresh status every 30 seconds
setInterval(loadApps, 30000);

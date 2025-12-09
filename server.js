const express = require("express");
const cors = require("cors");
const launchManager = require("./launch-manager");
const config = require("./config/apps.config.json");

const app = express();

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static("frontend"));

// API Routes
app.get("/api/apps", (req, res) => {
  res.json(config.apps);
});

app.post("/api/apps/:id/launch", async (req, res) => {
  try {
    console.log(`Launching app: ${req.params.id}`);
    const result = await launchManager.startApp(req.params.id);
    res.json(result);
  } catch (error) {
    console.error("Launch error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/apps/:id/status", async (req, res) => {
  try {
    const status = await launchManager.getAppStatus(req.params.id);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
const PORT = 8050;
app.listen(PORT, () => {
  console.log(`🚀 Dashboard server running on http://localhost:${PORT}`);
  console.log(`📊 API available at http://localhost:${PORT}/api/apps`);
  console.log(`⚡ Test it: curl http://localhost:${PORT}/api/health`);
});

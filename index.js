require("dotenv").config();
const express = require("express");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");

const PORT = process.env.PORT || 3000;
const PROMTOOL_PATH = process.env.PROMTOOL_PATH;
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || "http://localhost:9090";
const TSDB_PATH = process.env.TSDB_PATH;

const execAsync = promisify(exec);

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/metrics", async (req, res) => {
  try {
    if (!PROMTOOL_PATH) {
      return res.status(500).json({
        success: false,
        error: "PROMTOOL_PATH environment variable is not configured",
      });
    }

    if (!PROMETHEUS_URL) {
      return res.status(500).json({
        success: false,
        error: "PROMETHEUS_URL environment variable is not configured",
      });
    }

    const command = `"${PROMTOOL_PATH}" query labels ${PROMETHEUS_URL} __name__`;
    const { stdout, stderr } = await execAsync(command);

    if (stderr && !stdout) {
      throw new Error(stderr);
    }

    const metrics = stdout
      .split("\n")
      .filter(
        (line) =>
          line.trim() &&
          !line.startsWith("go_") &&
          !line.startsWith("process_") &&
          !line.startsWith("prometheus_") &&
          !line.startsWith("promhttp_") &&
          !line.startsWith("net_conntrack_") &&
          !line.startsWith("scrape_") &&
          line !== "up"
      );

    res.json({
      success: true,
      message: "Metrics fetched successfully",
      metrics,
    });
  } catch (error) {
    console.error("Error fetching metrics:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch metrics from Prometheus",
    });
  }
});

app.post("/api/export", async (req, res) => {
  const { minTime, maxTime, selectedMetrics, outputPath } = req.body;

  // Validation
  if (!outputPath) {
    return res.status(400).json({
      success: false,
      error: "Output file path is required",
    });
  }

  if (!selectedMetrics || selectedMetrics.length === 0) {
    return res.status(400).json({
      success: false,
      error: "At least one metric must be selected",
    });
  }

  if (!PROMTOOL_PATH) {
    return res.status(500).json({
      success: false,
      error: "PROMTOOL_PATH environment variable is not configured",
    });
  }

  if (!TSDB_PATH) {
    return res.status(500).json({
      success: false,
      error: "TSDB_PATH environment variable is not configured",
    });
  }

  // Validate time range
  if (minTime && maxTime && minTime > maxTime) {
    return res.status(400).json({
      success: false,
      error: "Start time must be before end time",
    });
  }

  try {
    let command = `"${PROMTOOL_PATH}" tsdb dump-openmetrics`;

    if (minTime) {
      command += ` --min-time=${minTime}`;
    }

    if (maxTime) {
      command += ` --max-time=${maxTime}`;
    }

    const matchPattern = selectedMetrics.join("|");
    command += ` --match '{__name__=~"${matchPattern}"}'`;

    command += ` "${TSDB_PATH}" > "${outputPath}"`;

    const { stderr } = await execAsync(command, {
      maxBuffer: 1024 * 1024 * 100,
    });

    if (stderr) {
      console.warn("Export stderr:", stderr);
    }

    res.json({
      success: true,
      message: `✓ Successfully exported ${selectedMetrics.length} metric(s)`,
      outputPath,
    });
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to export metrics",
    });
  }
});

app.post("/api/import", async (req, res) => {
  const { inputPath } = req.body;

  // Validation
  if (!inputPath) {
    return res.status(400).json({
      success: false,
      error: "Input file path is required",
    });
  }

  if (!PROMTOOL_PATH) {
    return res.status(500).json({
      success: false,
      error: "PROMTOOL_PATH environment variable is not configured",
    });
  }

  if (!TSDB_PATH) {
    return res.status(500).json({
      success: false,
      error: "TSDB_PATH environment variable is not configured",
    });
  }

  try {
    const command = `"${PROMTOOL_PATH}" tsdb create-blocks-from openmetrics "${inputPath}" "${TSDB_PATH}"`;
    const { stderr } = await execAsync(command, {
      maxBuffer: 1024 * 1024 * 100,
    });

    if (stderr) {
      console.warn("Import stderr:", stderr);
    }

    res.json({
      success: true,
      message: "✓ Successfully imported metrics",
    });
  } catch (error) {
    console.error("Import error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to import metrics",
    });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: err.message || "Internal server error",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
  });
});

// Validate configuration on startup
function validateConfig() {
  const errors = [];

  if (!PROMTOOL_PATH) {
    errors.push("PROMTOOL_PATH environment variable is not configured");
  }

  if (!TSDB_PATH) {
    errors.push("TSDB_PATH environment variable is not configured");
  }

  if (errors.length > 0) {
    console.error("✗ Configuration errors:");
    errors.forEach((err) => console.error(`  - ${err}`));
    console.error(
      "\nPlease configure the required environment variables in your .env file"
    );
    return false;
  }

  return true;
}

app.listen(PORT, () => {
  console.log("\n" + "=".repeat(50));
  console.log("PromPort - Prometheus Export/Import Tool");
  console.log("=".repeat(50));

  if (validateConfig()) {
    console.log("✓ Configuration validated successfully");
    console.log(`✓ Server is running on http://localhost:${PORT}`);
    console.log(`✓ Prometheus URL: ${PROMETHEUS_URL}`);
    console.log(`✓ TSDB path: ${TSDB_PATH}`);
  } else {
    console.log("⚠ Server started with configuration errors");
    console.log(`⚠ Server is running on http://localhost:${PORT}`);
    console.log("⚠ Some features may not function correctly");
  }

  console.log("=".repeat(50) + "\n");
});

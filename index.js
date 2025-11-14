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
    const command = `"${PROMTOOL_PATH}" query labels ${PROMETHEUS_URL} __name__`;
    const { stdout } = await execAsync(command);

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
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/export", async (req, res) => {
  const { minTime, maxTime, selectedMetrics, outputPath } = req.body;

  if (!outputPath) {
    return res.status(400).json({ error: "Output path is required" });
  }

  if (!selectedMetrics || selectedMetrics.length === 0) {
    return res
      .status(400)
      .json({ error: "At least one metric must be selected" });
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

    await execAsync(command, { maxBuffer: 1024 * 1024 * 100 });

    res.json({
      success: true,
      message: "Export completed successfully",
      outputPath,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/import", async (req, res) => {
  const { inputPath } = req.body;

  if (!inputPath) {
    return res.status(400).json({ error: "Input path is required" });
  }

  try {
    const command = `"${PROMTOOL_PATH}" tsdb create-blocks-from openmetrics "${inputPath}" "${TSDB_PATH}"`;
    await execAsync(command, { maxBuffer: 1024 * 1024 * 100 });

    res.json({
      success: true,
      message: "Import completed successfully",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`PromPort running on http://localhost:${PORT}`);
});

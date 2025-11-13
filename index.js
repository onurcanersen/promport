require("dotenv").config();
const express = require("express");
const { exec } = require("child_process");
const { promisify } = require("util");

const PORT = process.env.PORT || 3000;
const PROMTOOL_PATH = process.env.PROMTOOL_PATH;
const TSDB_PATH = process.env.TSDB_PATH;

const execAsync = promisify(exec);

const app = express();

app.use(express.json());

app.post("/api/export", async (req, res) => {
  const { minTime, maxTime, selectedMetrics, outputPath } = req.body;

  if (!outputPath) {
    return res.status(400).json({ error: "Output path is required" });
  }

  try {
    let command = `"${PROMTOOL_PATH}" tsdb dump-openmetrics`;

    if (minTime) {
      command += ` --min-time=${minTime}`;
    }

    if (maxTime) {
      command += ` --max-time=${maxTime}`;
    }

    if (selectedMetrics && selectedMetrics.length > 0) {
      const matchPattern = selectedMetrics.join("|");
      command += ` --match "${matchPattern}"`;
    }

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

app.listen(PORT, () => {
  console.log(`PromPort running on http://localhost:${PORT}`);
});

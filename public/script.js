let allMetrics = [];
const API_BASE = "/api";

// Load metrics on page load
window.addEventListener("DOMContentLoaded", () => {
  loadMetrics();
});

function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.remove("active");
  });
  event.target.classList.add("active");

  // Update tab content
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.remove("active");
  });
  document.getElementById(`${tabName}-tab`).classList.add("active");

  // Clear alerts
  hideAlert("export-alert");
  hideAlert("import-alert");
}

async function loadMetrics() {
  const container = document.getElementById("metrics-container");

  try {
    const response = await fetch(`${API_BASE}/metrics`);
    const data = await response.json();

    if (data.success) {
      allMetrics = data.metrics;
      displayMetrics(allMetrics);
    } else {
      throw new Error("Failed to load metrics");
    }
  } catch (error) {
    container.innerHTML = `<div style="color: #d32f2f; text-align: center; padding: 20px;">
            ❌ Error loading metrics: ${error.message}
        </div>`;
  }
}

function displayMetrics(metrics) {
  const container = document.getElementById("metrics-container");

  if (metrics.length === 0) {
    container.innerHTML =
      '<div style="text-align: center; color: #999; padding: 20px;">No metrics found</div>';
    return;
  }

  const html = `
        <div class="metrics-header">
            <span class="metrics-count">${
              metrics.length
            } metrics available</span>
            <button class="select-all-btn" onclick="toggleSelectAll()">Select All</button>
        </div>
        ${metrics
          .map(
            (metric, index) => `
            <div class="metric-item">
                <input type="checkbox" id="metric-${index}" value="${metric}" class="metric-checkbox">
                <label for="metric-${index}">${metric}</label>
            </div>
        `
          )
          .join("")}
    `;

  container.innerHTML = html;
}

function filterMetrics() {
  const searchTerm = document
    .getElementById("metric-search")
    .value.toLowerCase();
  const filteredMetrics = allMetrics.filter((metric) =>
    metric.toLowerCase().includes(searchTerm)
  );
  displayMetrics(filteredMetrics);
}

function toggleSelectAll() {
  const checkboxes = document.querySelectorAll(".metric-checkbox");
  const allChecked = Array.from(checkboxes).every((cb) => cb.checked);

  checkboxes.forEach((cb) => {
    cb.checked = !allChecked;
  });
}

function getSelectedMetrics() {
  const checkboxes = document.querySelectorAll(".metric-checkbox:checked");
  return Array.from(checkboxes).map((cb) => cb.value);
}

async function exportMetrics() {
  const outputPath = document.getElementById("output-path").value.trim();

  if (!outputPath) {
    showAlert("export-alert", "Please provide an output file path", "error");
    return;
  }

  const selectedMetrics = getSelectedMetrics();
  const minTime = document.getElementById("min-time").value;
  const maxTime = document.getElementById("max-time").value;

  const payload = {
    outputPath,
    selectedMetrics: selectedMetrics.length > 0 ? selectedMetrics : undefined,
    minTime: minTime ? new Date(minTime).getTime() : undefined,
    maxTime: maxTime ? new Date(maxTime).getTime() : undefined,
  };

  try {
    showAlert("export-alert", "Exporting metrics...", "success");

    const response = await fetch(`${API_BASE}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.success) {
      showAlert(
        "export-alert",
        `✅ ${data.message}\nFile: ${data.outputPath}`,
        "success"
      );
    } else {
      throw new Error(data.error || "Export failed");
    }
  } catch (error) {
    showAlert("export-alert", `❌ Export failed: ${error.message}`, "error");
  }
}

async function importMetrics() {
  const inputPath = document.getElementById("input-path").value.trim();

  if (!inputPath) {
    showAlert("import-alert", "Please provide an input file path", "error");
    return;
  }

  try {
    showAlert("import-alert", "Importing metrics...", "success");

    const response = await fetch(`${API_BASE}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputPath }),
    });

    const data = await response.json();

    if (data.success) {
      showAlert("import-alert", `✅ ${data.message}`, "success");
      document.getElementById("input-path").value = "";
    } else {
      throw new Error(data.error || "Import failed");
    }
  } catch (error) {
    showAlert("import-alert", `❌ Import failed: ${error.message}`, "error");
  }
}

function showAlert(elementId, message, type) {
  const alert = document.getElementById(elementId);
  alert.textContent = message;
  alert.className = `alert ${type} active`;
}

function hideAlert(elementId) {
  const alert = document.getElementById(elementId);
  alert.classList.remove("active");
}

function setTimeRange(amount, unit) {
  const now = new Date();
  const end = now;
  const start = new Date(now);

  switch (unit) {
    case "hour":
      start.setHours(start.getHours() - amount);
      break;
    case "day":
      start.setDate(start.getDate() - amount);
      break;
  }

  // Format dates for datetime-local input (YYYY-MM-DDTHH:MM)
  const formatDateTime = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  document.getElementById("min-time").value = formatDateTime(start);
  document.getElementById("max-time").value = formatDateTime(end);

  // Update export filename
  updateExportFilename();
}

function updateExportFilename() {
  const minTime = document.getElementById("min-time").value;
  const maxTime = document.getElementById("max-time").value;

  if (minTime && maxTime) {
    // Convert to timestamp format (remove special characters)
    const minTimestamp = minTime.replace(/[-:T]/g, "").substring(0, 12); // YYYYMMDDHHmm
    const maxTimestamp = maxTime.replace(/[-:T]/g, "").substring(0, 12); // YYYYMMDDHHmm

    const filename = `/tmp/prom_dump_${minTimestamp}_${maxTimestamp}.txt`;
    document.getElementById("output-path").value = filename;
  } else {
    document.getElementById("output-path").value = "/tmp/prom_dump.txt";
  }
}

function handleExportFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    // For file save dialog, we want to get the path
    // In browsers, we can only get the filename, not full path
    // The user will need to manually enter the full path
    const path = file.path || `/tmp/${file.name}`;
    document.getElementById("output-path").value = path;
  }
}

function handleImportFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    // For file open dialog, try to get the full path
    // In browsers, we can only get the filename
    const path = file.path || `/tmp/${file.name}`;
    document.getElementById("input-path").value = path;
  }
}

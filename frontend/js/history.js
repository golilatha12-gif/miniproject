const table = document.getElementById("historyTable");
const searchInput = document.getElementById("searchInput");
const severityFilter = document.getElementById("severityFilter");
const emptyState = document.getElementById("emptyState");
const tableWrapper = document.getElementById("tableWrapper");
const toggleEmpty = document.getElementById("toggleEmpty");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const confirmModal = document.getElementById("confirmModal");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
const undoToast = document.getElementById("undoToast");
const undoBtn = document.getElementById("undoBtn");

let allData = [];
let showEmpty = false;
let currentFiltered = [];
let backupData = null;
let undoTimer = null;

// ================= FETCH HISTORY =================
async function loadHistory() {
  // Check authentication
  if (!window.requireAuthOrRedirect || !window.requireAuthOrRedirect()) {
    return; // Redirects to login if not authenticated
  }

  try {
    // Get auth headers from centralized helper
    const headers = window.getAuthHeaders ? window.getAuthHeaders() : {};
    const res = await fetch("http://localhost:8000/history", { method: "GET", headers });
    
    if (!res.ok) {
      console.error("Failed to load history:", res.status);
      if (res.status === 401) {
        if (window.handle401) window.handle401();
        else window.location.href = 'login.html';
      }
      render([]);
      return;
    }
    
    allData = await res.json();
      filterData();
  } catch (err) {
    console.error("Failed to load history", err);
    render([]);
  }
}

// ================= SAFE DATE =================
function formatDate(ts) {
  if (!ts) return "—";
  // If timestamp is already formatted (from backend), return as is
  if (typeof ts === 'string' && !isNaN(Date.parse(ts))) {
    return ts;
  }
  // Otherwise try to parse and format
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString('en-IN', { 
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

// ================= RENDER =================
function render(rows) {
  table.innerHTML = "";
  currentFiltered = rows.slice();

  if (rows.length === 0) {
    tableWrapper.classList.add("hidden");
    emptyState.classList.remove("hidden");
    return;
  }

  tableWrapper.classList.remove("hidden");
  emptyState.classList.add("hidden");

  rows.forEach(item => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <img 
          src="http://localhost:8000${item.original_image || ''}"
          width="48" height="48"
          onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIGZpbGw9IiNFRUVFRUUiLz48dGV4dCB4PSIyNCIgeT0iMjQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg=='"
        />
      </td>
      <td>${item.disease}</td>
      <td><span class="badge ${item.severity.toLowerCase()}">${item.severity}</span></td>
      <td>${item.confidence}%</td>
      <td>${formatDate(item.timestamp)}</td>
      <td style="text-align:right">
        <button class="btn btn-outline" onclick='viewResult(${JSON.stringify(item)})'>👁</button>
        <button class="btn btn-danger" onclick="deleteDetection(${item.id})">🗑️</button>
      </td>
    `;
    table.appendChild(tr);
  });
}

// ================= FILTER =================
function filterData() {
  let filtered = allData.filter(d =>
    d.disease.toLowerCase().includes(searchInput.value.toLowerCase())
  );

  if (severityFilter.value !== "all") {
    filtered = filtered.filter(d => d.severity === severityFilter.value);
  }

  render(filtered);
}

// ================= EXPORT CSV =================
function exportCSV() {
  // Use currently displayed rows
  const rows = currentFiltered && currentFiltered.length ? currentFiltered : allData;
  if (!rows || rows.length === 0) {
    alert('No detections to export');
    return;
  }

  const header = ['Image','Disease','Severity','Confidence','Date & Time'];
  const lines = [header.join(',')];

  rows.forEach(r => {
    const img = r.original_image ? `http://localhost:8000${r.original_image}` : '';
    const disease = (r.disease||'').replace(/"/g,'""');
    const severity = r.severity || '';
    const confidence = r.confidence || '';
    const dt = formatDate(r.timestamp);
    const line = [`"${img}"`,`"${disease}"`,`"${severity}"`,`"${confidence}"`,`"${dt}"`].join(',');
    lines.push(line);
  });

  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `riceguard-history-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ================= SAFE CLEAR / UNDO =================
function showConfirmModal() { confirmModal.classList.remove('hidden'); }
function hideConfirmModal() { confirmModal.classList.add('hidden'); }
function showUndoToast() { undoToast.classList.remove('hidden'); }
function hideUndoToast() { undoToast.classList.add('hidden'); }

function startUndoCountdown() {
  // 10 seconds
  if (undoTimer) clearTimeout(undoTimer);
  undoTimer = setTimeout(async () => {
    // commit permanent delete
    await performPermanentDelete();
    hideUndoToast();
    backupData = null;
    undoTimer = null;
  }, 10000);
}

async function performPermanentDelete() {
  if (!backupData || backupData.length === 0) return;
  // Call backend delete for each detection id
  try {
    const headers = window.getAuthHeaders ? window.getAuthHeaders() : {};
    // Delete sequentially to detect errors and handle restore if any fail
    for (const item of backupData) {
      try {
        const res = await fetch(`http://localhost:8000/delete/${item.id}`, { method: 'DELETE', headers });
        if (!res.ok) throw new Error('Delete failed: ' + res.status);
      } catch (err) {
        console.error('Permanent delete failed for id', item.id, err);
        // Restore UI and inform user
        allData = backupData.slice();
        filterData();
        alert('Failed to permanently delete detections. Restored locally. Error: ' + err.message);
        return;
      }
    }
    // If all succeeded, reload history from backend to ensure consistency
    await loadHistory();
  } catch (err) {
    console.error('Error during permanent delete', err);
    // Try to restore
    allData = backupData.slice();
    filterData();
    alert('An error occurred while deleting detections: ' + err.message);
  }
}

function clearDetectionsSafe() {
  if (!allData || allData.length === 0) {
    alert('No detections to clear');
    return;
  }
  // Backup current data
  backupData = allData.slice();
  // Clear UI only
  allData = [];
  filterData();
  hideConfirmModal();
  showUndoToast();
  startUndoCountdown();
}

function undoClear() {
  if (!backupData) return;
  if (undoTimer) clearTimeout(undoTimer);
  allData = backupData.slice();
  backupData = null;
  undoTimer = null;
  filterData();
  hideUndoToast();
}

// ================= VIEW RESULT =================
function viewResult(item) {
  localStorage.setItem("riceguard_result", JSON.stringify(item));
  window.location.href = "result.html";
}

// ================= DELETE =================
async function deleteDetection(id) {
  if (!confirm("Delete this detection permanently?")) return;

  // Check authentication
  if (!window.requireAuthOrRedirect || !window.requireAuthOrRedirect()) {
    return; // Redirects to login if not authenticated
  }

  try {
    // Get auth headers from centralized helper
    const headers = window.getAuthHeaders ? window.getAuthHeaders() : {};
    const res = await fetch(`http://localhost:8000/delete/${id}`, { method: "DELETE", headers });

    if (!res.ok) {
      console.error("Delete failed:", res.status);
      if (res.status === 401) {
        if (window.handle401) window.handle401();
        else window.location.href = 'login.html';
      } else {
        alert("This detection no longer exists.");
      }
      loadHistory();
      return;
    }

    alert("Detection deleted");
    loadHistory();
  } catch (err) {
    console.error("Delete error:", err);
    alert("Delete failed: " + err.message);
  }
}

// ================= EVENTS =================
searchInput.addEventListener("input", filterData);
severityFilter.addEventListener("change", filterData);

// Export button
if (exportBtn) exportBtn.addEventListener('click', exportCSV);

// Clear button -> confirmation modal
if (clearBtn) clearBtn.addEventListener('click', () => showConfirmModal());
if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', clearDetectionsSafe);
if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', () => hideConfirmModal());
if (undoBtn) undoBtn.addEventListener('click', undoClear);

// Keep the old toggle behavior if present (backwards compat)
if (toggleEmpty) {
  toggleEmpty.addEventListener("click", () => {
    showEmpty = !showEmpty;
    tableWrapper.classList.toggle("hidden", showEmpty);
    emptyState.classList.toggle("hidden", !showEmpty);
  });
}

// ================= INIT =================
loadHistory();

// Shared state and chart instances
let currentData = [];
let pieChartInstance = null;
let trendChartInstance = null;
let barChartInstance = null;
let trendMode = 'daily';
let registeredListeners = false;
// shared UI state (declare early to avoid TDZ when updateDashboard runs)
let activeFilter = null;
let filterInfo = null;
let recentList = null;
let trendCtx = null;
let barElem = null;
let barCtx = null;

async function loadDashboard() {
  // Check authentication
  if (!window.requireAuthOrRedirect || !window.requireAuthOrRedirect()) {
    return; // Redirects to login if not authenticated
  }

  try {
    // Get auth headers from centralized helper
    const headers = window.getAuthHeaders ? window.getAuthHeaders() : {};
    const res = await fetch("http://localhost:8000/history", { method: "GET", headers });
    
    if (!res.ok) {
      console.error("Failed to load dashboard:", res.status);
      if (res.status === 401) {
        if (window.handle401) window.handle401();
        else window.location.href = 'login.html';
      }
      return;
    }
    
    const data = await res.json();
    // initial store
    currentData = data;
    console.log('Dashboard initial data length:', data.length);
    // initialize DOM refs before rendering
    trendCtx = document.getElementById("trendChart") ? document.getElementById("trendChart").getContext("2d") : null;
    barElem = document.getElementById('barChart');
    barCtx = barElem ? barElem.getContext('2d') : null;
    recentList = document.getElementById("recentList");
    filterInfo = document.getElementById('filterInfo');

    updateDashboard(data);

    // start polling for new detections (every 8 seconds)
    setInterval(async () => {
      try {
        const headers2 = window.getAuthHeaders ? window.getAuthHeaders() : {};
        const r = await fetch("http://localhost:8000/history", { method: "GET", headers: headers2 });
        if (!r.ok) return;
        const fresh = await r.json();
        // if newest detection changed, update
        const freshNewest = fresh[0]?.id;
        const currentNewest = currentData[0]?.id;
        if (fresh.length !== currentData.length || freshNewest !== currentNewest) {
          currentData = fresh;
          updateDashboard(fresh);
        }
      } catch (e) {
        console.error('Polling failed:', e);
      }
    }, 8000);

  // initial render handled in updateDashboard()
  
  // register UI listeners once
  if (!registeredListeners) {
    document.getElementById('trendDaily')?.addEventListener('click', () => { trendMode = 'daily'; renderTrend(trendMode); });
    document.getElementById('trendWeekly')?.addEventListener('click', () => { trendMode = 'weekly'; renderTrend(trendMode); });
    registeredListeners = true;
  }
  // ------------------
  // Trend (time series) helpers (use `currentData`)
  // ------------------
  function getDayKey(ts) {
    try {
      const d = parseTimestamp(ts);
      return d ? d.toISOString().slice(0,10) : null;
    } catch(e) { return null; }
  }

  function getWeekKey(ts) {
    const d = parseTimestamp(ts);
    if (!d) return null;
    const year = d.getFullYear();
    const target = new Date(d.valueOf());
    const dayNr = (d.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = new Date(target.getFullYear(),0,4);
    const diff = (target - firstThursday) / 86400000;
    const week = 1 + Math.floor(diff/7);
    return `${year}-W${String(week).padStart(2,'0')}`;
  }

  function aggregateByKey(keyFn) {
    const counts = {};
    currentData.forEach(d => {
      // backend returns `created_at` field; accept both `timestamp` and `created_at`
      const ts = d.timestamp || d.created_at || d.createdAt || d.time;
      const k = keyFn(ts);
      if (!k) return;
      counts[k] = (counts[k] || 0) + 1;
    });
    const keys = Object.keys(counts).sort();
    return { labels: keys, values: keys.map(k => counts[k]) };
  }

  // Robust timestamp parser: accepts ISO or 'YYYY-MM-DD HH:MM:SS' formats
  function parseTimestamp(ts) {
    if (!ts) return null;
    const tryDate = (s) => {
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    };
    let d = tryDate(ts);
    if (d) return d;
    // normalize space to T: 'YYYY-MM-DD HH:MM:SS' -> 'YYYY-MM-DDTHH:MM:SS'
    const s2 = String(ts).replace(' ', 'T');
    d = tryDate(s2);
    if (d) return d;
    // try adding Z
    d = tryDate(s2 + 'Z');
    return d;
  }

  // (already initialized earlier) ensure trendCtx is set
  trendCtx = trendCtx || (document.getElementById("trendChart") ? document.getElementById("trendChart").getContext("2d") : null);

  function renderTrend(mode = 'daily') {
    if (!trendCtx) return;
    const agg = mode === 'weekly' ? aggregateByKey(getWeekKey) : aggregateByKey(getDayKey);
    console.log('renderTrend labels count:', agg.labels.length);
    if (trendChartInstance) trendChartInstance.destroy();
    trendChartInstance = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: agg.labels,
        datasets: [{
          label: 'Detections',
          data: agg.values,
          borderColor: '#36A2EB',
          backgroundColor: 'rgba(54,162,235,0.2)',
          fill: true,
          tension: 0.2
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { maxRotation: 0 } } }
      }
    });
  }

  // ------------------
  // Bar chart (counts per disease) with click-to-filter
  // ------------------
  barElem = document.getElementById('barChart');
  barCtx = barElem ? barElem.getContext('2d') : null;

  function renderBarChart() {
    if (!barCtx) return;
    const diseaseCountsLocal = {};
    currentData.forEach(d => diseaseCountsLocal[d.disease] = (diseaseCountsLocal[d.disease] || 0) + 1);
    const bLabels = Object.keys(diseaseCountsLocal);
    console.log('renderBarChart labels:', bLabels);
    const bValues = bLabels.map(l => diseaseCountsLocal[l]);

    if (barChartInstance) barChartInstance.destroy();
    barChartInstance = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: bLabels,
        datasets: [{ data: bValues, backgroundColor: '#FF6384' }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } }
      }
    });

    // clickable bars
    barElem.onclick = function(evt) {
      const points = barChartInstance.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
      if (points.length) {
        const idx = points[0].index;
        const disease = barChartInstance.data.labels[idx];
        applyFilter(disease);
      }
    };
  }

  // Helper to render recent detections with optional disease filter
  recentList = document.getElementById("recentList");
  function renderRecent(filterDisease = null) {
    if (!recentList) return;
    recentList.innerHTML = "";
    const recentItems = currentData.filter(d => !filterDisease || d.disease === filterDisease).slice(0, 5);
    recentItems.forEach(d => {
      const div = document.createElement("div");
      div.className = "recent-item";
      div.innerHTML = `
        <span>${d.disease}</span>
        <small class="${d.severity.toLowerCase()}">${d.severity}</small>
      `;
      recentList.appendChild(div);
    });
  }

  filterInfo = document.getElementById('filterInfo');
  function applyFilter(disease) {
    activeFilter = disease;
    renderRecent(activeFilter);
    filterInfo.style.display = 'block';
    filterInfo.innerHTML = `<strong>Filter:</strong> ${disease} <button id="clearFilter" class="btn btn-sm">Clear</button>`;
    document.getElementById('clearFilter')?.addEventListener('click', () => { clearFilter(); });
  }

  function clearFilter() {
    activeFilter = null;
    renderRecent();
    filterInfo.style.display = 'none';
    filterInfo.innerHTML = '';
  }

  renderBarChart();

  // Initial recent render (no filter)
  renderRecent();

  // helper: update all charts and UI from data
  function updateDashboard(data) {
    // Stats
    document.getElementById("totalDetections").innerText = data.length;
    const diseaseSet = new Set(data.map(d => d.disease));
    document.getElementById("diseaseCount").innerText = diseaseSet.size;
    if (data.length > 0) {
      const avg = data.reduce((sum, d) => sum + d.confidence, 0) / data.length;
      document.getElementById("avgConfidence").innerText = avg.toFixed(1) + "%";
    }
    const severe = data.filter(d => d.severity === "Severe").length;
    document.getElementById("severeCount").innerText = severe;

    // Pie chart
    const diseaseCounts = {};
    data.forEach(d => { diseaseCounts[d.disease] = (diseaseCounts[d.disease] || 0) + 1; });
    const labels = Object.keys(diseaseCounts);
    const values = Object.values(diseaseCounts);
    const pieCtx = document.getElementById("distributionChart").getContext("2d");
    if (pieChartInstance) {
      pieChartInstance.data.labels = labels;
      pieChartInstance.data.datasets[0].data = values;
      pieChartInstance.update();
    } else {
      pieChartInstance = new Chart(pieCtx, {
        type: "pie",
        data: { labels, datasets: [{ data: values, backgroundColor: ["#FF6384","#36A2EB","#FFCE56","#4BC0C0","#9966FF","#FF9F40"] }] },
        options: { responsive: true, plugins: { legend: { position: "bottom" } } }
      });
    }

    // Trend & Bar: defer rendering slightly to ensure layout/calcs are ready
    try {
      setTimeout(() => {
        try {
          const agg = (trendMode === 'weekly') ? aggregateByKey(getWeekKey) : aggregateByKey(getDayKey);
          console.log('updateDashboard trend labels:', agg.labels.length);
          // Ensure canvases have a reasonable height if CSS collapsed them
          try {
            const trendEl = document.getElementById('trendChart');
            if (trendEl && (trendEl.clientHeight === 0 || parseInt(getComputedStyle(trendEl).height) < 60)) {
              trendEl.style.height = '220px';
              trendEl.height = 220;
              console.log('Set trendChart canvas height to 220px to avoid collapse');
            }
            const barElLocal = document.getElementById('barChart');
            if (barElLocal && (barElLocal.clientHeight === 0 || parseInt(getComputedStyle(barElLocal).height) < 60)) {
              barElLocal.style.height = '220px';
              barElLocal.height = 220;
              console.log('Set barChart canvas height to 220px to avoid collapse');
            }
          } catch (e) { console.warn('canvas height adjust failed', e); }

          renderTrend(trendMode);

          // Bar chart
          const diseaseCountsLocal = {};
          data.forEach(d => diseaseCountsLocal[d.disease] = (diseaseCountsLocal[d.disease] || 0) + 1);
          const bLabels = Object.keys(diseaseCountsLocal);
          const bValues = bLabels.map(l => diseaseCountsLocal[l]);
          console.log('updateDashboard bar labels:', bLabels);
          if (barChartInstance) {
            barChartInstance.data.labels = bLabels;
            barChartInstance.data.datasets[0].data = bValues;
            barChartInstance.update();
          } else {
            renderBarChart();
          }
        } catch (inner) {
          console.error('Deferred render failed:', inner);
        }
      }, 50);
    } catch (e) {
      console.error('Scheduling render failed:', e);
    }

    // Recent
    renderRecent(activeFilter);
  }

  // expose updateDashboard for initial load
  updateDashboard(currentData);
  } catch (err) {
    console.error("Failed to load dashboard:", err);
  }
}

loadDashboard();

/* ===========================
   USER BUTTON - REDIRECT TO PROFILE
   ============================ */
document.getElementById("userBtn")?.addEventListener("click", () => {
  const user = localStorage.getItem("riceguard_user");
  
  if (!user) {
    // No token → redirect to login
    window.location.href = "login.html";
  } else {
    // Valid token → redirect to profile
    window.location.href = "profile.html";
  }
});

/* ===========================
   SIDEBAR TOGGLE
   ============================ */
document.getElementById("openSidebar")?.addEventListener("click", () => {
  document.getElementById("sidebar").classList.add("active");
});

document.getElementById("closeSidebar")?.addEventListener("click", () => {
  document.getElementById("sidebar").classList.remove("active");
});


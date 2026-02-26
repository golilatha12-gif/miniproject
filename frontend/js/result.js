const analyzing = document.getElementById("analyzing");
const resultPage = document.getElementById("resultPage");
const baseURL = "http://localhost:8000";

// ================= SHOW RESULT PAGE =================
setTimeout(() => {
  analyzing?.classList.add("hidden");
  resultPage?.classList.remove("hidden");
}, 1200);

// ================= LOAD RESULT =================
const result = JSON.parse(localStorage.getItem("riceguard_result"));

if (!result || !result.disease) {
  alert("No detection data found");
  window.location.href = "index.html";
}

// ================= TEXT DATA =================
document.getElementById("diseaseName").innerText = result.disease;
document.getElementById("severity").innerText = result.severity || "—";
document.getElementById("description").innerText =
  result.description || "No description available";

// ================= CONFIDENCE =================
document.getElementById("confidenceBar").style.width =
  (result.confidence || 0) + "%";

// ================= LABEL =================
document.getElementById("detectionLabel").innerText =
  `${result.disease} Detected`;

// ================= IMAGES =================
setImage("originalImg", result.original_image);
setImage("detectImg", result.result_image);
setImage("heatmapImg", result.result_image);

function setImage(id, path) {
  const img = document.getElementById(id);
  if (!img) return;

  if (!path) {
    img.src = placeholderImage();
  } else {
    img.src = baseURL + path;
  }
}

// ================= POPULATE LISTS =================
(result.symptoms || []).forEach(s =>
  document.getElementById("symptoms")?.insertAdjacentHTML("beforeend", `<li>${s}</li>`)
);

(result.treatment || []).forEach(t =>
  document.getElementById("treatment")?.insertAdjacentHTML("beforeend", `<li>${t}</li>`)
);

(result.prevention || []).forEach(p =>
  document.getElementById("prevention")?.insertAdjacentHTML("beforeend", `<li>${p}</li>`)
);

// ================= FEEDBACK =================
const feedbackForm = document.getElementById("feedbackForm");

feedbackForm?.addEventListener("submit", async e => {
  e.preventDefault();

  const rating = document.querySelector('input[name="rating"]:checked')?.value;
  const comments = document.getElementById("comments")?.value || "";

  if (!rating) {
    alert("Please select a rating");
    return;
  }

  if (!result.detection_id) {
    alert("Feedback unavailable for old records");
    return;
  }

  try {
    const headers = { "Content-Type": "application/json", ...(window.getAuthHeaders ? window.getAuthHeaders() : {}) };
    const res = await fetch(`${baseURL}/feedback`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        detection_id: result.detection_id,
        rating: parseInt(rating),
        comments
      })
    });

    if (!res.ok) {
      if (res.status === 401) {
        if (window.handle401) window.handle401();
        else { localStorage.removeItem('riceguard_user'); window.location.href='login.html'; }
        return;
      }
      throw new Error('Failed to submit feedback');
    }
    alert("Thank you for your feedback!");
    feedbackForm.reset();
  } catch (err) {
    console.error('Feedback error:', err);
    alert("Failed to submit feedback");
  }
});

// ================= DOWNLOAD REPORT =================
document.getElementById("downloadReport")?.addEventListener("click", async () => {
  try {
    const headers = { "Content-Type": "application/json", ...(window.getAuthHeaders ? window.getAuthHeaders() : {}) };
    const res = await fetch(`${baseURL}/generate_report`, { method: "POST", headers, body: JSON.stringify(result) });
    if (!res.ok) {
      if (res.status === 401) {
        if (window.handle401) window.handle401();
        else { localStorage.removeItem('riceguard_user'); window.location.href='login.html'; }
        return;
      }
      throw new Error('Request failed');
    }
    const data = await res.json();

    const link = document.createElement("a");
    link.href = baseURL + data.file_url;
    link.download = "riceguard_report.pdf";
    link.click();
  } catch (err) {
    console.error('Report error', err);
    alert("Failed to generate report");
  }
});

// ================= SHARE =================
document.getElementById("shareResult")?.addEventListener("click", () => {
  if (navigator.share) {
    navigator.share({
      title: "RiceGuard AI Detection Result",
      text: `Disease detected: ${result.disease}`,
      url: window.location.href
    });
  } else {
    navigator.clipboard.writeText(window.location.href);
    alert("Link copied to clipboard!");
  }
});

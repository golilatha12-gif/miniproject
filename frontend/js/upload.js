const fileInput = document.getElementById("fileInput");
const previewContainer = document.getElementById("previewContainer");
const previewImage = document.getElementById("previewImage");
const uploadPlaceholder = document.getElementById("uploadPlaceholder");
const detectBtn = document.getElementById("detectBtn");

let selectedFile = null;

function openFilePicker() {
  fileInput.click();
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Please upload a valid image file");
    fileInput.value = "";
    return;
  }

  selectedFile = file;

  const reader = new FileReader();
  reader.onload = () => {
    previewImage.src = reader.result;
    previewContainer.classList.remove("hidden");
    uploadPlaceholder.classList.add("hidden");
    detectBtn.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
});

function removeImage(e) {
  e.stopPropagation();
  previewImage.src = "";
  previewContainer.classList.add("hidden");
  uploadPlaceholder.classList.remove("hidden");
  detectBtn.classList.add("hidden");
  fileInput.value = "";
  selectedFile = null;
}

async function detectDisease() {
  if (!selectedFile) {
    alert("Please upload an image first");
    return;
  }

  if (!window.requireAuthOrRedirect()) return;

  detectBtn.innerText = "Detecting...";
  detectBtn.disabled = true;

  const formData = new FormData();
  formData.append("file", selectedFile);

  try {
    const headers = window.getAuthHeaders();
    // Don't set Content-Type header for FormData - browser handles boundary automatically

    const response = await fetch("http://localhost:8000/detect", {
      method: "POST",
      headers,
      body: formData,
    });

    if (response.status === 401) {
      window.handle401();
      return;
    }

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.detail || "Detection failed");
    }

    localStorage.setItem("riceguard_result", JSON.stringify(result));
    window.location.href = "result.html";

  } catch (error) {
    console.error("Detection error:", error);
    alert("Detection failed: " + error.message);
  } finally {
    detectBtn.innerText = "Detect Disease →";
    detectBtn.disabled = false;
  }
}

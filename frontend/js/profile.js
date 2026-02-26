/* ===========================
   FETCH USER PROFILE
   ============================ */
async function fetchUserProfile() {
  // Check authentication
  if (!window.requireAuthOrRedirect || !window.requireAuthOrRedirect()) {
    return; // Redirects to login if not authenticated
  }

  try {
    // Get auth headers from centralized helper
    const headers = window.getAuthHeaders ? window.getAuthHeaders() : {};
    const response = await fetch("http://localhost:8000/me", { method: "GET", headers });

    const data = await response.json();
    if (!response.ok) {
      const msg = data?.detail || data?.error || `Failed to fetch profile: ${response.status}`;
      if (response.status === 401) {
        if (window.handle401) {
          window.handle401();
        } else {
          localStorage.removeItem('riceguard_user');
          window.location.href = 'login.html';
        }
        return;
      }
      throw new Error(msg);
    }
    // Populate form fields
    document.getElementById("email").value = data.email || "";
    document.getElementById("name").value = data.name || "";
    document.getElementById("nickname").value = data.nickname || "";
  } catch (error) {
    console.error("Fetch profile error:", error);
    alert("Could not load profile. " + error.message);
  }
}

/* ===========================
   SAVE PROFILE
   ============================ */
document.getElementById("saveProfile")?.addEventListener("click", async () => {
  // Check authentication
  if (!window.requireAuthOrRedirect || !window.requireAuthOrRedirect()) {
    return; // Redirects to login if not authenticated
  }

  const email = document.getElementById("email").value.trim();
  const name = document.getElementById("name").value.trim();
  const nickname = document.getElementById("nickname").value.trim();

  if (!email) {
    alert("Email is required.");
    return;
  }

  try {
    // Get auth headers from centralized helper
    // Build headers safely and include JSON content-type
    const headers = window.getAuthHeaders ? window.getAuthHeaders() : {};
    headers['Content-Type'] = 'application/json';

    // Use localhost (requested) and ensure PUT method
    const url = "http://localhost:8000/update-profile";

    try {
      const response = await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify({ email: email || null, name: name || null, nickname: nickname || null }),
      });

      // Try to parse JSON body safely (may be empty or non-json)
      let data = null;
      try {
        data = await response.json();
      } catch (parseErr) {
        // ignore parse error, will handle based on status
      }

      if (!response.ok) {
        const serverMsg = data?.detail || data?.message || data?.error || `Server returned ${response.status}`;
        // Clearer messaging for auth issues
        if (response.status === 401) {
          alert("Authorization error. Please log in again.");
          if (window.handle401) {
            window.handle401();
          } else {
            localStorage.removeItem('riceguard_user');
            window.location.href = 'login.html';
          }
          return;
        }
        alert("Error updating profile: " + serverMsg);
        return;
      }

      // Success path
      alert("Profile updated successfully!");
      const stored = (window.getStoredUser && window.getStoredUser()) || {};
      stored.email = data?.user?.email || stored.email;
      if (window.setStoredUser && typeof window.setStoredUser === 'function') {
        window.setStoredUser(stored);
      } else {
        localStorage.setItem('riceguard_user', JSON.stringify(stored));
      }
    } catch (networkErr) {
      // Network errors (fetch failed) -> likely backend unreachable
      console.error("Network error when saving profile:", networkErr);
      if (networkErr instanceof TypeError || /failed to fetch/i.test(String(networkErr))) {
        alert("Cannot reach backend at http://localhost:8000 — please ensure the backend server is running.");
      } else {
        alert("Error updating profile: " + (networkErr.message || networkErr));
      }
    }
  } catch (error) {
    console.error("Save profile error:", error);
    alert("Error updating profile: " + error.message);
  }
});

/* ===========================
   CHANGE PASSWORD
   ============================ */
document.getElementById("changePasswordBtn")?.addEventListener("click", async () => {
  // Check authentication
  if (!window.requireAuthOrRedirect || !window.requireAuthOrRedirect()) {
    return; // Redirects to login if not authenticated
  }

  const oldPassword = document.getElementById("oldPassword").value;
  const newPassword = document.getElementById("newPassword").value;

  if (!oldPassword || !newPassword) {
    alert("Both old and new passwords are required.");
    return;
  }

  if (oldPassword === newPassword) {
    alert("New password must be different from old password.");
    return;
  }

  try {
    const headers = (window.getAuthHeaders && window.getAuthHeaders()) || {};
    headers['Content-Type'] = 'application/json';

    const response = await fetch("http://localhost:8000/change-password", {
      method: "PUT",
      headers,
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    });

    const data = await response.json();

    if (response.ok) {
      alert("Password changed successfully!");
      document.getElementById("oldPassword").value = "";
      document.getElementById("newPassword").value = "";
    } else {
      alert("Error: " + (data.detail || data.message || "Failed to change password"));
      if (response.status === 401) {
        if (window.handle401) {
          window.handle401();
        } else {
          localStorage.removeItem('riceguard_user');
          window.location.href='login.html';
        }
      }
    }
  } catch (error) {
    console.error("Change password error:", error);
    alert("Error changing password: " + error.message);
  }
});

/* ===========================
   SIDEBAR TOGGLE
   - Use a simple reusable toggle to show/hide the sidebar
   - Toggle the CSS class that the existing stylesheet expects ("show")
   - Uses classList.toggle() so the same logic works on all pages
   ============================ */
(() => {
  const openBtn = document.getElementById("openSidebar");
  const closeBtn = document.getElementById("closeSidebar");
  const sidebar = document.getElementById("sidebar");

  if (!sidebar) return;

  // Toggle function reused for open and close
  function toggleMenu(e) {
    e && e.preventDefault();
    sidebar.classList.toggle('show');
  }

  if (openBtn) openBtn.addEventListener('click', toggleMenu);
  if (closeBtn) closeBtn.addEventListener('click', toggleMenu);

  // Close when clicking outside the sidebar (optional and non-invasive)
  document.addEventListener('click', (ev) => {
    // If sidebar is open and click is outside both the sidebar and open button, close it
    if (!sidebar.classList.contains('show')) return;
    const target = ev.target;
    if (sidebar.contains(target) || (openBtn && openBtn.contains(target))) return;
    sidebar.classList.remove('show');
  });
})();

/* ===========================
   INIT
   ============================ */
document.addEventListener("DOMContentLoaded", () => {
  fetchUserProfile();
});

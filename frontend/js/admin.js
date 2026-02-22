/**
 * RiceGuard AI - Admin Authentication & Dashboard
 * Safely extends existing auth flow without modifying existing files.
 */

(function () {
  "use strict";

  // =====================================================
  // ADMIN LOGIN LOGIC (admin-login.html)
  // =====================================================
  
  const adminLoginForm = document.getElementById("adminLoginForm");

  if (adminLoginForm) {
    // Toggle password visibility
    const togglePassword = document.getElementById("togglePassword");
    const passwordInput = document.getElementById("password");

    if (togglePassword) {
      togglePassword.onclick = () => {
        passwordInput.type =
          passwordInput.type === "password" ? "text" : "password";
      };
    }

    // Handle form submission
    adminLoginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;

      try {
        // Use existing /login endpoint
        const response = await fetch("http://127.0.0.1:8000/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
          alert(data.detail || "Login failed");
          return;
        }

        // Decode JWT to check role
        const token = data.access_token;
        const role = decodeJWTRole(token);

        if (role !== "admin") {
          // Not an admin - reject access
          console.warn("❌ Non-admin user attempted admin login");
          alert("Unauthorized: Admin access only.");
          return;
        }

        // Valid admin - store session and redirect
        const storedData = {
          access_token: data.access_token,
          token_type: data.token_type,
          ...data.user
        };
        localStorage.setItem("riceguard_user", JSON.stringify(storedData));
        console.log("✓ Admin logged in:", storedData.email);

        window.location.href = "admin.html";

      } catch (error) {
        console.error("Admin login error:", error);
        alert("Login error: " + error.message);
      }
    });
  }

  // =====================================================
  // ADMIN DASHBOARD LOGIC (admin.html)
  // =====================================================

  // Check authorization on admin.html load
  if (document.getElementById("adminHeader") || document.getElementById("usersContainer")) {
    // We're on admin.html
    verifyAdminAccess();
    loadAdminData();

    // Logout button
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        clearSession();
        window.location.href = "login.html";
      });
    }
  }

  /**
   * Verify user has admin role and valid JWT
   * Redirect to dashboard if not admin
   */
  function verifyAdminAccess() {
    const user = getStoredUser();

    if (!user || !user.access_token) {
      console.warn("❌ No valid session on admin page");
      window.location.href = "login.html";
      return;
    }

    const role = decodeJWTRole(user.access_token);

    if (role !== "admin") {
      console.warn("❌ Non-admin user on admin page. Redirecting...");
      alert("Access denied. You are not an admin.");
      clearSession();
      window.location.href = "dashboard.html";
      return;
    }

    console.log("✓ Admin access verified");
  }

  /**
   * Load admin data: users and detections
   */
  function loadAdminData() {
    loadUsersTable();
    loadDetectionsTable();
  }

  /**
   * Fetch and display users table
   */
  async function loadUsersTable() {
    const container = document.getElementById("usersContainer");
    if (!container) return;

    try {
      const token = getToken();
      const user = getStoredUser();
      const isSuperAdmin = user && user.email === "admin123@gmail.com";

      const response = await fetch("http://127.0.0.1:8000/admin/users", {
        method: "GET",
        headers: getAuthHeaders()
      });

      if (response.status === 401) {
        console.warn("❌ Unauthorized. Redirecting...");
        clearSession();
        window.location.href = "login.html";
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const users = await response.json();

      // Build table HTML with Actions column for super admin
      const actionHeader = isSuperAdmin ? '<th>Actions</th>' : '';
      let html = `
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Email</th>
              <th>Role</th>
              <th>Created At</th>
              ${actionHeader}
            </tr>
          </thead>
          <tbody>
      `;

      if (users.length === 0) {
        html += `<tr><td colspan="${isSuperAdmin ? 5 : 4}" style="text-align: center; color: var(--text-muted);">No users found</td></tr>`;
      } else {
        users.forEach((user) => {
          const roleBadge = user.role === "admin"
            ? `<span class="role-badge role-admin">ADMIN</span>`
            : `<span class="role-badge role-user">USER</span>`;
          
          // Build actions cell (only for super admin, not for super admin themselves)
          let actionsCell = '';
          if (isSuperAdmin && user.email !== "admin123@gmail.com") {
            const promoteBtn = user.role === "user" 
              ? `<button class="role-btn promote-btn" onclick="changeUserRole('${user.email}', 'admin')">Promote</button>`
              : '';
            const demoteBtn = user.role === "admin"
              ? `<button class="role-btn demote-btn" onclick="changeUserRole('${user.email}', 'user')">Demote</button>`
              : '';
            actionsCell = `<td><div class="role-cell-actions">${promoteBtn}${demoteBtn}</div></td>`;
          } else if (isSuperAdmin) {
            actionsCell = '<td style="color: var(--text-muted); font-size: 12px;">Super Admin</td>';
          } else {
            actionsCell = '';
          }

          html += `
            <tr>
              <td>${user.id}</td>
              <td>${user.email}</td>
              <td>${roleBadge}</td>
              <td>${user.created_at || "—"}</td>
              ${actionsCell}
            </tr>
          `;
        });
      }

      html += `
          </tbody>
        </table>
      `;

      container.innerHTML = html;

    } catch (error) {
      console.error("Error loading users:", error);
      container.innerHTML = `<div class="error">Failed to load users: ${error.message}</div>`;
    }
  }

  /**
   * Fetch and display detections table
   */
  async function loadDetectionsTable() {
    const container = document.getElementById("detectionsContainer");
    if (!container) return;

    try {
      const response = await fetch("http://127.0.0.1:8000/admin/all-detections", {
        method: "GET",
        headers: getAuthHeaders()
      });

      if (response.status === 401) {
        console.warn("❌ Unauthorized. Redirecting...");
        clearSession();
        window.location.href = "login.html";
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const detections = await response.json();

      // Build table HTML
      let html = `
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Disease</th>
              <th>Confidence</th>
              <th>Severity</th>
              <th>User Email</th>
              <th>Created At</th>
            </tr>
          </thead>
          <tbody>
      `;

      if (detections.length === 0) {
        html += '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No detections found</td></tr>';
      } else {
        detections.forEach((d) => {
          html += `
            <tr>
              <td>${d.id}</td>
              <td>${d.disease}</td>
              <td>${d.confidence.toFixed(2)}%</td>
              <td>${d.severity}</td>
              <td>${d.user_email || "—"}</td>
              <td>${d.created_at || "—"}</td>
            </tr>
          `;
        });
      }

      html += `
          </tbody>
        </table>
      `;

      container.innerHTML = html;

    } catch (error) {
      console.error("Error loading detections:", error);
      container.innerHTML = `<div class="error">Failed to load detections: ${error.message}</div>`;
    }
  }

  /**
   * Decode JWT and extract role claim
   * @param {string} token - JWT token
   * @returns {string|null} - role claim or null if invalid
   */
  function decodeJWTRole(token) {
    try {
      if (!token) return null;

      const parts = token.split(".");
      if (parts.length !== 3) {
        console.warn("❌ Invalid JWT format");
        return null;
      }

      // Decode payload (base64url)
      const payload = parts[1];
      const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
      const data = JSON.parse(decoded);

      return data.role || null;
    } catch (error) {
      console.error("Error decoding JWT:", error);
      return null;
    }
  }

  /**
   * Change user role (super admin only)
   * Exposed globally for onclick handlers
   */
  window.changeUserRole = async function(email, newRole) {
    const user = getStoredUser();
    if (!user || user.email !== "admin123@gmail.com") {
      alert("Only super admin can change roles");
      return;
    }

    const confirmed = confirm(`Change ${email} role to '${newRole}'?`);
    if (!confirmed) return;

    try {
      const response = await fetch("http://127.0.0.1:8000/admin/set-role", {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, role: newRole })
      });

      const data = await response.json();

      if (response.status === 403) {
        alert("Super admin access only");
        return;
      }

      if (!response.ok) {
        alert(`Error: ${data.detail || "Role change failed"}`);
        return;
      }

      console.log(`✓ Role updated: ${email} -> ${newRole}`);
      alert(`Role updated: ${email} is now ${newRole}`);
      
      // Refresh user table
      loadUsersTable();

    } catch (error) {
      console.error("Error changing role:", error);
      alert(`Failed to change role: ${error.message}`);
    }
  };

})();

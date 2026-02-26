// PASSWORD TOGGLE
const togglePassword = document.getElementById("togglePassword");
const passwordInput = document.getElementById("password");

if (togglePassword) {
  togglePassword.onclick = () => {
    passwordInput.type =
      passwordInput.type === "password" ? "text" : "password";
  };
}

// LOGIN FORM
// LOGIN FORM
const loginForm = document.getElementById("loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      const response = await fetch("http://localhost:8000/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();
      console.log("LOGIN RESPONSE:", data);

      if (!response.ok) {
        alert(data.detail || "Login failed");
        return;
      }

      // 🔥 PROPERLY STRUCTURE AND STORE RESPONSE
      const storedData = {
        access_token: data.access_token,
        token_type: data.token_type,
        ...data.user  // Spread user object so user_id is at top level
      };
      localStorage.setItem("riceguard_user", JSON.stringify(storedData));

      console.log("Stored user:", storedData);

      window.location.href = "home.html";

    } catch (error) {
      console.error("Login error:", error);
      alert("Login error: " + error.message);
    }
  });
}

// ================= REGISTER LOGIC =================
// ================= REGISTER LOGIC =================
if (document.getElementById("registerForm")) {

  const password = document.getElementById("password");
  const confirmPassword = document.getElementById("confirmPassword");
  const rules = {
    length: document.getElementById("rule-length"),
    upper: document.getElementById("rule-upper"),
    lower: document.getElementById("rule-lower"),
    number: document.getElementById("rule-number"),
  };
  const terms = document.getElementById("terms");
  const registerBtn = document.getElementById("registerBtn");
  const matchMsg = document.getElementById("matchMsg");

  function updateRule(el, valid) {
    if (!el) return;
    el.textContent = (valid ? "✔ " : "❌ ") + el.textContent.slice(2);
    el.style.color = valid ? "green" : "";
  }

  function validatePassword() {
    if (!password) return false;
    const val = password.value;

    const checks = {
      length: val.length >= 8,
      upper: /[A-Z]/.test(val),
      lower: /[a-z]/.test(val),
      number: /[0-9]/.test(val),
    };

    updateRule(rules.length, checks.length);
    updateRule(rules.upper, checks.upper);
    updateRule(rules.lower, checks.lower);
    updateRule(rules.number, checks.number);

    return Object.values(checks).every(Boolean);
  }

  function validateMatch() {
    if (!password || !confirmPassword) return false;
    const match = password.value === confirmPassword.value && confirmPassword.value !== "";
    if (matchMsg) matchMsg.classList.toggle("hidden", match);
    return match;
  }

  function toggleRegisterButton() {
    if (!registerBtn) return;
    registerBtn.disabled = !(validatePassword() && validateMatch() && terms?.checked);
  }

  password?.addEventListener("input", toggleRegisterButton);
  confirmPassword?.addEventListener("input", toggleRegisterButton);
  terms?.addEventListener("change", toggleRegisterButton);

  document.getElementById("toggleConfirm")?.addEventListener("click", () => {
    confirmPassword.type =
      confirmPassword.type === "password" ? "text" : "password";
  });

  document.getElementById("registerForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fullName = document.getElementById("fullName").value;
    const email = document.getElementById("email").value;
    const passwordVal = document.getElementById("password").value;

    try {
      const response = await fetch("http://localhost:8000/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ full_name: fullName, email, password: passwordVal }),
      });

      const data = await response.json();

      if (response.ok) {
        // Store the JWT token and user data like login does
        const storedData = {
          access_token: data.access_token,
          token_type: data.token_type,
          ...data.user
        };
        localStorage.setItem("riceguard_user", JSON.stringify(storedData));
        
        alert("Account created successfully! Redirecting to home...");
        window.location.href = "home.html";
      } else {
        alert(data.detail || data.error || "Registration failed.");
      }

    } catch (error) {
      alert("Registration error: " + error.message);
    }
  });
}

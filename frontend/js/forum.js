async function loadPosts() {
  // GET /forum is public read - no auth required
  const res = await fetch("http://localhost:8000/forum");
  if (!res.ok) {
    console.error("Failed to load forum posts:", res.status);
    return;
  }
  const posts = await res.json();
  const postsDiv = document.getElementById("posts");
  postsDiv.innerHTML = "";

  posts.forEach(post => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <h3>${post.title}</h3>
      <p><strong>${post.user}</strong> - ${new Date(post.created_at).toLocaleString()}</p>
      <p>${post.content}</p>
    `;
    postsDiv.appendChild(div);
  });
}

document.getElementById("postForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  // Check authentication
  if (!window.requireAuthOrRedirect || !window.requireAuthOrRedirect()) {
    return; // Redirects to login if not authenticated
  }
  
  const user = document.getElementById("user").value;
  const title = document.getElementById("title").value;
  const content = document.getElementById("content").value;

  try {
    // Get auth headers from centralized helper
    const headers = window.getAuthHeaders ? window.getAuthHeaders() : {};
    headers['Content-Type'] = 'application/json';
    
    const res = await fetch("http://localhost:8000/forum", {
      method: "POST",
      headers,
      body: JSON.stringify({ user, title, content })
    });
    
    if (!res.ok) {
      const data = await res.json();
      console.error("Post failed:", data);
      if (res.status === 401) {
        if (window.handle401) window.handle401();
        else window.location.href = 'login.html';
      } else {
        alert("Failed to post: " + (data.detail || data.error || "Server error"));
      }
      return;
    }

    document.getElementById("postForm").reset();
    loadPosts();
  } catch (err) {
    console.error("Post error:", err);
    alert("Error posting: " + err.message);
  }
});

loadPosts();
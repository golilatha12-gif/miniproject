document.getElementById("contactForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value;
  const message = document.getElementById("message").value;

  try {
    // Contact form is a public endpoint - no auth required
    const res = await fetch("http://localhost:8000/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, message })
    });
    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }
    const data = await res.json();
    alert(data.message || data.success || "Message sent successfully!");
    document.getElementById("contactForm").reset();
  } catch (error) {
    console.error("Contact error:", error);
    alert("Failed to send message: " + error.message);
  }
});}

// WEBSOCKET CHAT
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendChat = document.getElementById("sendChat");

const ws = new WebSocket("ws://localhost:8000/ws/chat");

ws.onmessage = (event) => {
  const div = document.createElement("div");
  div.textContent = event.data;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
};

sendChat.addEventListener("click", () => {
  const message = chatInput.value.trim();
  if (message) {
    ws.send(message);
    chatInput.value = "";
  }
});

chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendChat.click();
});
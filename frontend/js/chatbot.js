document.addEventListener('DOMContentLoaded', () => {
  const promptEl = document.getElementById('prompt');
  const sendBtn = document.getElementById('send');
  const clearBtn = document.getElementById('clear');
  const replyEl = document.getElementById('reply');
  const statusEl = document.getElementById('status');

  async function sendPrompt() {
    const prompt = (promptEl.value || '').trim();
    replyEl.classList.remove('error');
    replyEl.textContent = '';
    if (!prompt) {
      statusEl.textContent = 'Please enter a prompt.';
      return;
    }
    statusEl.textContent = 'Sending...';
    sendBtn.disabled = true;
    try {
      const res = await fetch('/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const txt = await res.text();
        replyEl.classList.add('error');
        replyEl.textContent = `Error ${res.status}: ${txt}`;
        statusEl.textContent = '';
        return;
      }

      const data = await res.json();
      replyEl.textContent = data.reply || '';
      statusEl.textContent = '';
    } catch (err) {
      replyEl.classList.add('error');
      replyEl.textContent = 'Network error: ' + (err.message || err);
      statusEl.textContent = '';
    } finally {
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener('click', sendPrompt);
  promptEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendPrompt();
    }
  });
  clearBtn.addEventListener('click', () => { promptEl.value = ''; replyEl.textContent = ''; statusEl.textContent = ''; });
});
const chatBody = document.getElementById("chatBody");
const chatInput = document.getElementById("chatInput");

const botResponses = {
  default:
    "I'm your AI farming assistant 🌾. Ask me anything about rice diseases, prevention, fertilizers, or harvesting!",
  "bacterial leaf blight":
    "Bacterial Leaf Blight (BLB) is caused by Xanthomonas oryzae. It creates yellow-white lesions and can reduce yield by up to 50% if untreated.",
  "prevent rice":
    "Prevention tips:\n1. Use resistant varieties\n2. Avoid excess nitrogen\n3. Maintain spacing\n4. Ensure drainage\n5. Remove infected residues",
  "fertilizers":
    "Recommended fertilizers:\n• Nitrogen (N): 80–120 kg/ha\n• Phosphorus (P): 40–60 kg/ha\n• Potassium (K): 40–60 kg/ha\nSplit nitrogen into 3 stages.",
  "harvest":
    "Harvest rice when:\n• 80–85% grains are straw-colored\n• Grain moisture is 20–25%\n• Panicles droop naturally"
};

function addMessage(text, type) {
  const div = document.createElement("div");
  div.className = `chat-msg ${type} animate-slide`;
  div.innerText = text;
  chatBody.appendChild(div);
  chatBody.scrollTop = chatBody.scrollHeight;
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  addMessage(text, "user");
  chatInput.value = "";

  showTyping();

  try {
    // Chatbot is a public endpoint - no auth required
    const response = await fetch("http://localhost:8000/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    });
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    const data = await response.json();
    removeTyping();
    addMessage(data.response, "bot");
  } catch (error) {
    removeTyping();
    addMessage("Sorry, I'm unable to respond right now.", "bot");
  }
}

function quickAsk(text) {
  chatInput.value = text;
  sendMessage();
}

function showTyping() {
  const typing = document.createElement("div");
  typing.id = "typing";
  typing.className = "chat-msg bot typing";
  typing.innerText = "Typing...";
  chatBody.appendChild(typing);
}

function removeTyping() {
  const typing = document.getElementById("typing");
  if (typing) typing.remove();
}

addMessage(botResponses.default, "bot");

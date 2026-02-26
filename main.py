"""Minimal entrypoint that exposes the existing FastAPI `app` and
registers the chatbot routes without modifying `backend/app.py`.

Run with: `uvicorn main:app --reload`
"""
from importlib import import_module

# Import the existing FastAPI app object from backend.app
mod = import_module("backend.app")
app = getattr(mod, "app")

# Import chatbot and register routes
chatbot_mod = import_module("backend.chatbot")
if hasattr(chatbot_mod, "register"):
    chatbot_mod.register(app)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

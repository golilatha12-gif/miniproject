import os
import requests
from typing import Optional
from fastapi import APIRouter, HTTPException

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "phi3")

router = APIRouter()


def ask_ai(prompt: str, model: Optional[str] = None) -> str:
    """Send `prompt` to local Ollama HTTP API and return a text reply.

    Raises RuntimeError when Ollama is unreachable or returns an error.
    """
    if not isinstance(prompt, str) or not prompt.strip():
        return ""

    model = model or OLLAMA_MODEL
    url = f"{OLLAMA_HOST.rstrip('/')}/api/generate"
    # always ask phi3 (or whatever is in OLLAMA_MODEL) and disable streaming for
    # simpler handling; Ollama will return full JSON in one shot.
    payload = {"model": model, "prompt": prompt, "max_tokens": 1024, "stream": False}
    headers = {"Content-Type": "application/json"}

    try:
        # disable streaming so we get the complete response body at once
        resp = requests.post(url, json=payload, headers=headers, stream=False, timeout=10)
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"Could not reach Ollama at {OLLAMA_HOST}: {e}") from e

    if resp.status_code != 200:
        # include body for debugging but keep message concise
        body = None
        try:
            body = resp.text
        except Exception:
            body = "<unable to read body>"
        raise RuntimeError(f"Ollama returned status {resp.status_code}: {body[:200]}")

    # we asked with stream=False, so we can just parse the JSON body once
    text = ""
    try:
        data = resp.json()
        if isinstance(data, dict):
            # typical fields returned by Ollama
            text = data.get("response") or data.get("text") or data.get("output") or ""
        else:
            # fallback to raw text if parsing yields something unexpected
            text = resp.text or ""
    except Exception:
        text = resp.text or ""

    return (text or "").strip()


@router.post("/chatbot")
async def chatbot_endpoint(payload: dict):
    """POST endpoint that proxies a message to local Ollama and returns JSON.

    Request body: { "message": ".." }
    Response: { "reply": "AI response here" }
    """
    message = payload.get("message") if isinstance(payload, dict) else None
    if not message or not isinstance(message, str):
        raise HTTPException(status_code=400, detail="Missing or invalid 'message' in request body")

    try:
        reply = ask_ai(message)
    except RuntimeError as e:
        # Ollama down or unreachable
        raise HTTPException(status_code=503, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Internal error processing request")

    return {"reply": reply}


def register(app):
    """Register the chatbot router on an existing FastAPI `app`.

    Call this from your application's entrypoint so routes are added without
    modifying other files.
    """
    app.include_router(router)

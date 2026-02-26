# Rice Leaf Disease Detection — Project Summary

## Abstract

A lightweight web application for detecting diseases in rice leaves using a local deep-learning model. The system provides a user-friendly frontend for image upload and result viewing, and a Flask-based backend that handles image processing, model inference (PyTorch), report generation, and persistence to a local SQLite database. Designed to run offline for quick, on-device inference and easy deployment.

## Key Advantages

- Fast local inference using pre-trained model weights (no external API required).
- Simple web UI for non-technical users to upload and view results.
- Persistent history, admin controls, and PDF report generation.
- Modular backend and frontend separation for easy maintenance and extension.
- Test suite included for core workflows (basic smoke and admin tests).

## High-level Architecture

Browser (frontend) → HTTP API (Flask backend) → Inference (utils/predict.py using model/best.pt) → Persist results (SQLite DB) and files (model/uploads, model/results) → Frontend displays results.

Components:
- Frontend: Static HTML/CSS/JS in the `frontend/` folder. Handles file upload, result display, and user flows (login/profile/history).
- Backend: Flask app in `backend/` with modules for DB (`database.py`, `models.py`, `schemas.py`), routes (`app.py` / `start_server.py`), admin utilities, and model integration (`utils/predict.py`, `utils/pdf_report.py`).
- Model: PyTorch weight file at `model/best.pt` and helper scripts in `backend/model/` and `backend/utils/` for preprocessing and postprocessing.
- Storage: SQLite DB (riceguard.db), image uploads and outputs stored under `model/uploads` and `model/results`.

## Backend (Responsibilities & Files)

- API endpoints: defined in `backend/app.py` (and start script `backend/start_server.py`). Endpoints include image upload, detection request, history retrieval, admin actions, and authentication utilities.
- Database: `backend/database.py`, models/schemas in `backend/models.py` and `backend/schemas.py`. Uses SQLite by default (see `.env` / optional `DATABASE_URL`).
- Inference: `backend/utils/predict.py` loads `model/best.pt` and performs detection on uploaded images, writing result images and structured outputs (JSON) to `model/results/`.
- Reports: `backend/utils/pdf_report.py` generates PDF summaries for detections.
- Admin utilities: scripts like `create_images.py`, `init_db.py`, `populate_db.py`, and migration helpers for admin management.

## Frontend (Responsibilities & Files)

- Static UI: files in `frontend/` include HTML pages (`index.html`, `upload.html`, `result.html`, etc.), CSS in `frontend/css/`, and JS in `frontend/js/`.
- Client logic: `frontend/js/upload.js`, `frontend/js/result.js`, and `frontend/js/auth.js` handle user interactions, file uploads via fetch/XHR to backend APIs, display of returned detection results, and session handling.
- UX: simple, responsive pages with history, profile and admin views.

## Data Flow (Detailed)

1. User selects an image in the browser and submits an upload form.
2. Frontend sends the image to a backend API endpoint (`/detect` or similar) via `fetch` (multipart/form-data).
3. Backend saves the image to `model/uploads/` and enqueues processing.
4. `utils/predict.py` loads the model (`model/best.pt`), preprocesses the image, runs inference, and produces:
   - Annotated result image saved to `model/results/`.
   - Structured JSON with bounding boxes, classes, and confidence scores.
5. Backend stores metadata and result location in the SQLite DB and returns the detection JSON + URLs to frontend.
6. Frontend displays results and offers options (download PDF, view history).

## Storage & Database

- SQLite DB files found in `backend/` (e.g., `riceguard.db` and backups). Use `backend/init_db.py` to recreate/reset DB schema.
- Image files: `model/uploads/` (originals) and `model/results/` (annotated outputs).
- Reports: generated PDFs stored in results or an output folder.

## Security & Configuration

- Environment variables: `.env` in `backend/` contains `ADMIN_TOKEN` and optional `DATABASE_URL`. Do NOT commit sensitive keys to VCS.
- Admin access: scripts and admin routes require `ADMIN_TOKEN` or role-based checks implemented in backend utilities.
- Recommendations: rotate tokens, add proper authentication (e.g., hashed credentials, JWTs) if exposing externally, and use TLS in production.

## Testing

- Tests present at repo root like `test_admin_flow.py`, `test_smoke.py`, and `test_super_admin.py`. Run them via pytest from repo root:

```bash
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r backend/requirements.txt
pip install pytest
pytest -q
```

## Setup & Run (Quick Start)

1. Create and activate a Python virtual environment.

```bash
python -m venv venv
venv\Scripts\activate
```

2. Install dependencies.

```bash
pip install -r backend/requirements.txt
```

3. Copy or create `backend/.env` with required env vars (example: `ADMIN_TOKEN`, `DATABASE_URL` if needed).

4. Initialize the database (if provided):

```bash
python backend/init_db.py
```

5. Start the server (choose the provided start script):

```bash
python backend/start_server.py
# or
python backend/app.py
```

6. Open `frontend/index.html` in a browser or point the server's static route to the `frontend/` folder (the Flask app likely serves frontend pages).

## Deployment Notes

- For production: run behind a WSGI server (Gunicorn/Waitress) and configure environment variables securely.
- Use a reverse proxy (NGINX) for TLS termination and static file serving.
- If scaling, separate model inference into a worker service or containerize the model and scale independently.

## Contributing & Next Steps

- Improve authentication and user management (use hashed passwords, JWTs).
- Add CI for tests and linting.
- Add model versioning and A/B testing support.
- Move large file storage to cloud object storage for scalable deployments.

---

For small targeted edits (e.g., convert this into the repo `README.md`, or expand a specific section like API docs), tell me which section to expand and I will update it quickly.
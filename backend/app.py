from fastapi import FastAPI, File, UploadFile, WebSocket, HTTPException, Request, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import shutil
import os
import smtplib
from email.mime.text import MIMEText
from dotenv import load_dotenv
import pytz
from openai import OpenAI
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import timedelta, datetime

from utils.pdf_report import generate_pdf
from database import SessionLocal
from models import Feedback, ForumPost, Detection, User, PromotionAudit
from utils.predict import DISEASE_INFO
from schemas import UserOut, UserUpdate, ChangePassword

# IST Timezone
IST = pytz.timezone('Asia/Kolkata')

# =====================================================
# PASSWORD HASHING SETUP
# =====================================================
# Use PBKDF2-SHA256 for password hashing to avoid platform-specific bcrypt issues
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def _truncate_to_72(plain: str) -> str:
    """Truncate a UTF-8 string so its encoded bytes are <= 72 bytes.

    This avoids bcrypt errors when input exceeds the 72-byte limit.
    """
    if not isinstance(plain, str):
        return plain
    b = plain.encode("utf-8")
    if len(b) <= 72:
        return plain
    # truncate bytes then decode ignoring partial characters
    return b[:72].decode("utf-8", errors="ignore")


def hash_password(password: str) -> str:
    """Hash a password using bcrypt, truncating input bytes to 72 if needed."""
    pwd_input = _truncate_to_72(password)
    return pwd_context.hash(pwd_input)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against its hashed version using the same truncation."""
    plain_input = _truncate_to_72(plain_password)
    return pwd_context.verify(plain_input, hashed_password)


# Note: debug endpoint defined after `app` is created further below.


# Dependency: get current user from Authorization header (JWT support)
def get_current_user(authorization: str | None = Header(None)):
    """Return the current user based on JWT Bearer token.

    Accepts header: `Authorization: Bearer <jwt>`.
    For backward-compatibility, if the bearer token is a plain integer it will be
    treated as a user id (legacy behavior).
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = parts[1]

    # Try decode as JWT
    payload = decode_access_token(token)
    db = SessionLocal()
    try:
        if payload and ("sub" in payload or "user_id" in payload):
            uid = payload.get("sub") or payload.get("user_id")
            try:
                uid = int(uid)
            except Exception:
                raise HTTPException(status_code=401, detail="Invalid token payload")
            user = db.query(User).filter(User.id == uid).first()
            if not user:
                raise HTTPException(status_code=401, detail="User not found")
            return user

        # Fallback: legacy numeric bearer token
        try:
            user_id = int(token)
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                raise HTTPException(status_code=401, detail="User not found")
            return user
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")
    finally:
        db.close()


def get_current_user_optional(authorization: str | None = Header(None)):
    """Return the current user or None if no valid Authorization header provided.

    Accepts JWT bearer tokens or legacy numeric bearer token.
    """
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1]

    payload = decode_access_token(token)
    db = SessionLocal()
    try:
        if payload and ("sub" in payload or "user_id" in payload):
            uid = payload.get("sub") or payload.get("user_id")
            try:
                uid = int(uid)
            except Exception:
                return None
            return db.query(User).filter(User.id == uid).first()

        try:
            user_id = int(token)
            return db.query(User).filter(User.id == user_id).first()
        except Exception:
            return None
    finally:
        db.close()

# Load environment variables from .env file
load_dotenv()
# Also attempt to load a .env file located in the backend folder (when the
# application is started from the project root this ensures backend/.env is
# read and secrets such as OPENAI_API_KEY are available to the process).
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# Validate critical environment variables at startup
admin_token = os.getenv("ADMIN_TOKEN")
if not admin_token:
    raise RuntimeError("ADMIN_TOKEN environment variable is required for admin access")

# JWT / token settings
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    # Generate a temporary key if missing (warning: set SECRET_KEY in production)
    SECRET_KEY = os.urandom(32).hex()

ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

# OpenAI API key (must be set in environment variable OPENAI_API_KEY)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
_openai_client = None
if OPENAI_API_KEY:
    try:
        _openai_client = OpenAI(api_key=OPENAI_API_KEY)
        print(f"✅ OpenAI client initialized successfully")
    except Exception as e:
        print(f"❌ OpenAI client initialization failed: {e}")
        _openai_client = None
else:
    print(f"⚠️ OPENAI_API_KEY not found in environment")

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_access_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

# =====================================================
# APP INIT
# =====================================================
app = FastAPI(title="RiceGuard AI Backend")

# Initialize database on startup
@app.on_event("startup")
def startup_event():
    from database import init_db
    init_db()
    print("✅ Database initialized on startup")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8003", "http://127.0.0.1:8003"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Temporary debug endpoint to inspect `pwd_context` at runtime (remove in production)
@app.get('/__debug_pwd')
def debug_pwd():
    try:
        schemes = []
        try:
            schemes = list(pwd_context.schemes())
        except Exception:
            # fallback: try to access protected config
            schemes = getattr(getattr(pwd_context, '_config', {}), 'schemes', [])

        # quick hash/verify test using a short password via helper functions
        sample = 'short_test_pwd'
        h = hash_password(sample)
        ok = verify_password(sample, h)

        return {
            'schemes_configured': schemes,
            'sample_hash': h,
            'sample_verify': ok
        }
    except Exception as e:
        return {'error': str(e)}

# =====================================================
# PATHS
# =====================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
RESULT_DIR = os.path.join(UPLOAD_DIR, "results")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(RESULT_DIR, exist_ok=True)

# =====================================================
# STATIC FILES (FOR IMAGES)
# =====================================================
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# =====================================================
# AUTHENTICATION SYSTEM
# =====================================================
@app.post("/register")
def register_user(data: dict):
    """
    Register a new user
    - Accepts: full_name, email, password
    - Returns: {"message": "Registration successful"}
    """
    db = SessionLocal()
    try:
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""
        full_name = data.get("full_name")

        if not email:
            raise HTTPException(status_code=400, detail="Email is required")
        if not password:
            raise HTTPException(status_code=400, detail="Password is required")

        # Check if email already exists
        existing_user = db.query(User).filter(User.email == email).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already registered")

        # Hash password exactly once using passlib CryptContext
        hashed_password = hash_password(password)

        # Create new user; store hash in `hashed_password` only to avoid double-hashing
        new_user = User(
            full_name=full_name,
            email=email,
            hashed_password=hashed_password,
            password=None,
            is_active=True
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        # Create JWT access token and auto-login the user
        token_data = {"sub": str(new_user.id), "user_id": new_user.id, "role": getattr(new_user, "role", "user")}
        access_token = create_access_token(token_data)
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "user_id": new_user.id,
                "full_name": new_user.full_name,
                "email": new_user.email,
                "role": getattr(new_user, "role", "user")
            }
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")
    finally:
        db.close()

@app.post("/login")
def login_user(data: dict):
    """
    Login user with email and password
    - Accepts: email, password
    - Returns: user_id, full_name, email
    """
    db = SessionLocal()
    try:
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""

        if not email or not password:
            raise HTTPException(status_code=400, detail="Email and password are required")

        # Find user by email (case-insensitive)
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        # Support legacy `password` field if present, but prefer `hashed_password`
        stored_hash = getattr(user, "hashed_password", None) or getattr(user, "password", None)
        if not stored_hash:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        # Verify using passlib helper (no manual encoding/truncation)
        if not verify_password(password, stored_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        # Create JWT access token
        token_data = {"sub": str(user.id), "user_id": user.id, "role": getattr(user, "role", "user")}
        access_token = create_access_token(token_data)
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "user_id": user.id,
                "full_name": user.full_name,
                "email": user.email,
                "role": getattr(user, "role", "user")
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")
    finally:
        db.close()

# =====================================================
# DETECT API
# =====================================================
@app.post("/detect")
async def detect_disease(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    print("📥 Detection request received")
    print(f"📄 File: {file.filename}")

    # Validate file extension
    allowed_extensions = [".jpg", ".jpeg", ".png", ".webp"]
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        print(f"❌ Invalid file extension: {file_ext}")
        return {"error": "Only JPEG, PNG, and WebP images are allowed"}

    # Check file size (5MB limit)
    max_size = 5 * 1024 * 1024  # 5MB
    file.file.seek(0, 2)  # Seek to end
    size = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    if size > max_size:
        print("❌ File too large")
        return {"error": "File size exceeds 5MB limit"}

    print(f"📁 Processing file: {file.filename}")

    file_path = os.path.join(UPLOAD_DIR, file.filename)

    try:
        file_content = await file.read()
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)
        print("✅ File saved successfully")
    except Exception as e:
        print(f"❌ File save error: {e}")
        return {"error": "Failed to save file"}

    # 🔥 MODEL PREDICTION
    try:
        from utils.predict import predict_disease
        result = predict_disease(file_path)
        print(f"✅ Prediction successful: {result['disease']}")
    except Exception as e:
        import traceback
        print(f"❌ Prediction error: {e}")
        print(f"❌ Full traceback: {traceback.format_exc()}")
        return {"error": f"Prediction failed: {str(e)}"}

    # 💾 SAVE DETECTION TO DATABASE
    db = SessionLocal()
    try:
        detection = Detection(
            disease=result["disease"],
            confidence=result["confidence"],
            severity=result["severity"],
            image_path=result["original_image"],
            result_path=result["result_image"],
            user_id=current_user.id
        )
        db.add(detection)
        db.commit()
        db.refresh(detection)  # Get the auto-generated ID

        # Add detection ID to response
        result["detection_id"] = detection.id
        print(f"✅ Detection saved to database: ID {detection.id}, Disease: {detection.disease}")
        return result

    except Exception as e:
        db.rollback()
        print(f"❌ Database error: {e}")
        print(f"   Failed to save detection: {result['disease']} - {result['confidence']}%")
        return result  # Return result even if DB save fails
    finally:
        db.close()

    print("📤 Returning result")
    return result


# =====================================================
# HISTORY API (UPDATED TO READ FROM DATABASE)
# =====================================================
@app.get("/history")
def get_history(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        # Query detections for the current user only, ordered by newest first
        detections = db.query(Detection).filter(Detection.user_id == current_user.id).order_by(Detection.created_at.desc()).all()

        # Format response to match frontend expectations
        history = [
            {
                "id": d.id,
                "disease": d.disease,
                "confidence": d.confidence,
                "severity": d.severity,
                "original_image": d.image_path,
                "result_image": d.result_path,
                "timestamp": d.created_at.replace(tzinfo=pytz.UTC).astimezone(IST).strftime("%Y-%m-%d %H:%M:%S")
            }
            for d in detections
        ]
        return history
    finally:
        db.close()


# =====================================================
# DELETE DETECTION API
# =====================================================
@app.delete("/delete/{detection_id}")
def delete_detection(detection_id: int, current_user: User = Depends(get_current_user), x_admin_token: str | None = Header(None)):
    db = SessionLocal()
    try:
        detection = db.query(Detection).filter(Detection.id == detection_id).first()
        if not detection:
            raise HTTPException(status_code=404, detail="Detection not found")

        # Allow deletion if requestor is admin (via X-Admin-Token) or owner of the detection
        is_admin_token = x_admin_token is not None and x_admin_token == admin_token
        is_admin_role = getattr(current_user, "role", None) == "admin"
        if not (is_admin_token or is_admin_role) and detection.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this detection")

        # Delete the detection
        db.delete(detection)
        db.commit()

        # Optionally delete the image files
        try:
            if os.path.exists(os.path.join(BASE_DIR, detection.image_path.lstrip('/'))):
                os.remove(os.path.join(BASE_DIR, detection.image_path.lstrip('/')))
            if os.path.exists(os.path.join(BASE_DIR, detection.result_path.lstrip('/'))):
                os.remove(os.path.join(BASE_DIR, detection.result_path.lstrip('/')))
        except Exception as e:
            print(f"Warning: Could not delete image files: {e}")

        return {"message": "Detection deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error deleting detection: {str(e)}")
    finally:
        db.close()


# =====================================================
# ADMIN OVERVIEW (DATABASE INSPECTION)
# =====================================================
@app.get("/admin/overview")
def admin_overview(request: Request, current_user: User | None = Depends(get_current_user_optional)):
    # Secure admin access: accept either a valid X-Admin-Token header or a user with role 'admin'
    token = request.headers.get("X-Admin-Token")
    is_admin_token = token is not None and token == admin_token
    is_admin_role = getattr(current_user, "role", None) == "admin"
    if not (is_admin_token or is_admin_role):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    db = SessionLocal()
    try:
        # Query all detections ordered by newest first
        detections = db.query(Detection).order_by(Detection.created_at.desc()).all()
        
        result = []
        for d in detections:
            # Query related feedback for this detection
            feedback_list = db.query(Feedback).filter(Feedback.detection_id == str(d.id)).all()
            feedback_data = [
                {
                    "rating": f.rating,
                    "comments": f.comments,
                    "created_at": f.created_at.replace(tzinfo=pytz.UTC).astimezone(IST).strftime("%Y-%m-%d %H:%M:%S")
                }
                for f in feedback_list
            ]
            
            result.append({
                "id": d.id,
                "disease": d.disease,
                "confidence": d.confidence,
                "severity": d.severity,
                "created_at": d.created_at.replace(tzinfo=pytz.UTC).astimezone(IST).strftime("%Y-%m-%d %H:%M:%S"),
                "image_path": d.image_path,
                "result_path": d.result_path,
                "feedback": feedback_data
            })
        
        return result
    finally:
        db.close()


@app.post("/admin/promote")
def promote_user(data: dict, request: Request, current_user: User | None = Depends(get_current_user_optional)):
    """Promote a user to admin role.

    Accepts JSON with either `user_id` (int) or `email` (string).
    Authorization: requires either a valid `X-Admin-Token` header or a logged-in user with role `admin`.
    """
    token = request.headers.get("X-Admin-Token")
    is_admin_token = token is not None and token == admin_token
    is_admin_role = getattr(current_user, "role", None) == "admin"
    if not (is_admin_token or is_admin_role):
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = data.get("user_id")
    email = (data.get("email") or "").strip().lower()

    if not user_id and not email:
        raise HTTPException(status_code=400, detail="Provide `user_id` or `email` to promote")

    db = SessionLocal()
    try:
        user = None
        if user_id:
            try:
                uid = int(user_id)
            except Exception:
                raise HTTPException(status_code=400, detail="`user_id` must be an integer")
            user = db.query(User).filter(User.id == uid).first()
        else:
            user = db.query(User).filter(User.email == email).first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user.role = "admin"
        db.add(user)
        # Prepare audit record
        audit = PromotionAudit(
            admin_user_id = getattr(current_user, 'id', None),
            admin_email = getattr(current_user, 'email', None),
            target_user_id = user.id,
            target_email = user.email,
            method = 'token' if is_admin_token else 'role',
            note = data.get('note')
        )
        db.add(audit)
        db.commit()

        return {"message": "User promoted to admin", "user_id": user.id, "email": user.email}

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Promotion failed: {str(e)}")
    finally:
        db.close()


@app.get("/admin/promotions")
def list_promotions(request: Request,
                    page: int = 1,
                    per_page: int = 20,
                    target_email: str | None = None,
                    admin_email: str | None = None,
                    method: str | None = None,
                    start: str | None = None,
                    end: str | None = None,
                    current_user: User | None = Depends(get_current_user_optional)):
    """List promotion audit entries (admin-only).

    Query parameters:
    - `page` & `per_page` for pagination
    - `target_email`, `admin_email`, `method` to filter
    - `start` and `end` ISO datetimes to filter by created_at

    Access: requires `X-Admin-Token` or a logged-in admin user.
    """
    token = request.headers.get("X-Admin-Token")
    is_admin_token = token is not None and token == admin_token
    is_admin_role = getattr(current_user, "role", None) == "admin"
    if not (is_admin_token or is_admin_role):
        raise HTTPException(status_code=401, detail="Unauthorized")

    db = SessionLocal()
    try:
        q = db.query(PromotionAudit)

        if target_email:
            q = q.filter(PromotionAudit.target_email == target_email.strip().lower())
        if admin_email:
            q = q.filter(PromotionAudit.admin_email == admin_email.strip().lower())
        if method:
            q = q.filter(PromotionAudit.method == method)
        # Date range filtering (expect ISO format)
        from datetime import datetime
        def parse_iso(s):
            try:
                return datetime.fromisoformat(s)
            except Exception:
                return None

        sdt = parse_iso(start) if start else None
        edt = parse_iso(end) if end else None
        if sdt:
            q = q.filter(PromotionAudit.created_at >= sdt)
        if edt:
            q = q.filter(PromotionAudit.created_at <= edt)

        total = q.count()
        items = q.order_by(PromotionAudit.created_at.desc()).offset((max(page,1)-1)*(max(per_page,1))).limit(max(per_page,1)).all()

        results = [
            {
                "id": a.id,
                "admin_user_id": a.admin_user_id,
                "admin_email": a.admin_email,
                "target_user_id": a.target_user_id,
                "target_email": a.target_email,
                "method": a.method,
                "note": a.note,
                "created_at": a.created_at.isoformat()
            }
            for a in items
        ]

        return {
            "page": page,
            "per_page": per_page,
            "total": total,
            "items": results
        }
    finally:
        db.close()


# =====================================================
# GENERATE REPORT
# =====================================================
@app.post("/generate_report")
def generate_report(data: dict):
    import uuid
    file_name = f"report_{uuid.uuid4()}.pdf"
    file_path = os.path.join(RESULT_DIR, file_name)
    generate_pdf(data, file_path)
    return {"file_url": f"/uploads/results/{file_name}"}


# =====================================================
# FEEDBACK SYSTEM
# =====================================================
@app.post("/feedback")
def submit_feedback(data: dict, current_user: User = Depends(get_current_user)):
    """Submit feedback for a detection (must own the detection)."""
    db = SessionLocal()
    try:
        detection_id = data["detection_id"]
        
        # Verify detection exists and belongs to current user
        detection = db.query(Detection).filter(
            Detection.id == detection_id,
            Detection.user_id == current_user.id
        ).first()
        if not detection:
            raise HTTPException(status_code=403, detail="Detection not found or not owned by user")
        
        feedback = Feedback(
            detection_id=str(detection_id),
            rating=data["rating"],
            comments=data.get("comments", "")
        )
        db.add(feedback)
        db.commit()
        return {"message": "Feedback submitted"}
    finally:
        db.close()


# =====================================================
# FORUM
# =====================================================
@app.get("/forum")
def get_forum_posts():
    """Get all forum posts (public)."""
    db = SessionLocal()
    try:
        posts = db.query(ForumPost).all()
        return [{"id": p.id, "user": p.user, "title": p.title, "content": p.content, "created_at": p.created_at} for p in posts]
    finally:
        db.close()

@app.post("/forum")
def add_forum_post(data: dict, current_user: User = Depends(get_current_user)):
    """Add forum post (authenticated users only)."""
    db = SessionLocal()
    try:
        post = ForumPost(
            user=current_user.email,
            title=data["title"],
            content=data["content"]
        )
        db.add(post)
        db.commit()
        return {"message": "Post added"}
    finally:
        db.close()


# =====================================================
# RULE-BASED CHATBOT (OFFLINE, DISEASE_INFO ONLY)
# =====================================================
@app.post("/chatbot")
def chatbot_response(data: dict):
    # Expecting JSON: { "message": "user question" }
    user_message = (data.get("message") or "").strip()

    if not user_message:
        return {"reply": "Please provide a question.", "response": "Please provide a question."}

    # Prepare system prompt (general AI assistant, not just rice diseases)
    system_prompt = (
        "You are RiceGuard AI Assistant, a helpful agricultural AI expert.\n"
        "You can answer questions about rice farming, diseases, crop health, fertilizers, harvesting, and general agriculture.\n"
        "You also answer general knowledge questions helpfully.\n"
        "Respond clearly and concisely."
    )

    # Build conversation for chat completion
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message}
    ]

    print(f"🤖 Chatbot request: {user_message}")
    print(f"🔑 OPENAI_API_KEY available: {bool(OPENAI_API_KEY)}")
    print(f"🔌 _openai_client initialized: {_openai_client is not None}")

    # Try OpenAI first if available
    if OPENAI_API_KEY and _openai_client:
        try:
            print(f"📡 Sending to OpenAI...")
            model_name = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")
            print(f"🎯 Using model: {model_name}")

            completion = _openai_client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=0.7,
                max_tokens=500,
            )

            # Extract text from response
            choice = completion.choices[0]
            if hasattr(choice.message, 'content'):
                reply_text = choice.message.content
            else:
                reply_text = str(choice.message.get('content', ''))

            if reply_text:
                print(f"✅ OpenAI response received: {reply_text[:50]}...")
                return {"reply": reply_text.strip(), "response": reply_text.strip()}
            else:
                print(f"⚠️ Empty reply from OpenAI")
                raise ValueError("Empty reply from LLM")

        except Exception as e:
            import traceback
            print(f"❌ OpenAI error: {e}")
            print(f"❌ Traceback: {traceback.format_exc()}")
            # Fall through to generic response
    else:
        print(f"⚠️ OpenAI not configured, using generic response")

    # Fallback response
    print(f"📤 Returning generic response")
    return {
        "reply": "I'm here to help! Ask me about rice farming, diseases, crop health, or any other questions.",
        "response": "I'm here to help! Ask me about rice farming, diseases, crop health, or any other questions."
    }


# =====================================================
# EXPERT CONSULTATION (CONTACT FORM)
# =====================================================
@app.get("/me", response_model=UserOut)
def read_me(current_user: User = Depends(get_current_user)):
    """Return the authenticated user's profile information.

    Uses `Depends(get_current_user)` and returns 401 if unauthenticated.
    """
    return current_user


@app.put("/update-profile")
def update_profile(data: UserUpdate, current_user: User = Depends(get_current_user)):
    """Update authenticated user's profile (name, nickname, email).

    - Requires authentication via `get_current_user`.
    - If `email` is changed, ensures uniqueness (400 on conflict).
    - Commits and refreshes the DB record.
    - Returns a message and the updated user data (no passwords returned).
    """
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == current_user.id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        # Handle email change with uniqueness check
        if data.email and data.email.strip() and data.email != user.email:
            # Check for existing user with this email
            existing = db.query(User).filter(User.email == data.email).first()
            if existing and existing.id != user.id:
                raise HTTPException(status_code=400, detail="Email already in use")
            user.email = data.email

        if data.name is not None:
            user.name = data.name

        if data.nickname is not None:
            user.nickname = data.nickname

        db.add(user)
        db.commit()
        db.refresh(user)

        user_out = UserOut.from_orm(user)
        return {"message": "Profile updated", "user": user_out}
    finally:
        db.close()


@app.put("/change-password")
def change_password(data: ChangePassword, current_user: User = Depends(get_current_user)):
    """Change password for the authenticated user.

    - Verifies `old_password` using `verify_password`.
    - Hashes and saves `new_password`.
    - Returns 400 if old password incorrect, 401 if user not found.
    """
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == current_user.id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        # Determine which stored field holds the hash (support backward compatibility)
        stored_hash = None
        if getattr(user, "hashed_password", None):
            stored_hash = user.hashed_password
        elif getattr(user, "password", None):
            stored_hash = user.password

        if not stored_hash or not verify_password(data.old_password, stored_hash):
            raise HTTPException(status_code=400, detail="Old password is incorrect")

        new_hashed = hash_password(data.new_password)
        user.hashed_password = new_hashed
        # keep the legacy `password` field in sync if present
        user.password = new_hashed

        db.add(user)
        db.commit()
        db.refresh(user)

        return {"message": "Password changed successfully"}
    finally:
        db.close()

@app.post("/contact")
def contact_expert(data: dict):
    try:
        msg = MIMEText(f"Message: {data['message']}\nFrom: {data['email']}")
        msg['Subject'] = "Expert Consultation Request - RiceGuard"
        msg['From'] = "noreply@riceguard.com"  # Replace with your email
        msg['To'] = "expert@example.com"  # Replace with expert email
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login("your-email@gmail.com", "your-password")  # Use app password
        server.sendmail(msg['From'], msg['To'], msg.as_string())
        server.quit()
        return {"message": "Message sent to expert"}
    except:
        return {"error": "Failed to send message"}


# =====================================================
# WEBSOCKET CHAT FOR EXPERT CONSULTATION
# =====================================================
@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_text("Connected to expert chat. How can I help?")
    while True:
        try:
            data = await websocket.receive_text()
            # Simulate expert response (integrate with real logic)
            response = f"Expert: {data} - Please provide more details or contact via email."
            await websocket.send_text(response)
        except:
            break

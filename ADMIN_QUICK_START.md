# Admin Panel — Quick Reference

## 🚀 Fast Access

| Feature | URL / Command |
|---------|---------------|
| **Admin Login** | `http://localhost:8003/admin-login.html` |
| **Admin Dashboard** | `http://localhost:8003/admin.html` |
| **Normal Login** | `http://localhost:8003/login.html` |

---

## ⭐ Make Someone Admin (One-Time Setup)

```bash
curl -X POST http://127.0.0.1:8000/admin/promote \
  -H "X-Admin-Token: secretadmin123" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

Response:
```json
{"message": "User promoted to admin", "user_id": 2, "email": "user@example.com"}
```

---

## 🔑 Login & Test Admin Panel

### Option A: Via Web UI
1. Go to `http://localhost:8003/admin-login.html`
2. Enter email & password of admin user
3. Click "Sign In as Admin"
4. → Auto-redirected to admin dashboard

### Option B: Via curl (Testing)
```bash
# 1. Register user
curl -X POST http://127.0.0.1:8000/register \
  -H "Content-Type: application/json" \
  -d '{"email":"newadmin@example.com","password":"Test1234","full_name":"Admin User"}'

# 2. Promote to admin
curl -X POST http://127.0.0.1:8000/admin/promote \
  -H "X-Admin-Token: secretadmin123" \
  -H "Content-Type: application/json" \
  -d '{"email":"newadmin@example.com"}'

# 3. Login to get JWT
JWT=$(curl -s -X POST http://127.0.0.1:8000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"newadmin@example.com","password":"Test1234"}' \
  | jq -r '.access_token')

echo "Admin JWT: $JWT"

# 4. Access admin endpoints
curl -H "Authorization: Bearer $JWT" http://127.0.0.1:8000/admin/users
curl -H "Authorization: Bearer $JWT" http://127.0.0.1:8000/admin/all-detections
```

---

## 📊 Admin Dashboard Features

Once logged in, see:

### Users Table
- **ID** — User database ID
- **Email** — User email address
- **Role** — `admin` or `user`
- **Created At** — Registration timestamp

### Detections Table
- **ID** — Detection database ID
- **Disease** — Detected disease name
- **Confidence** — Detection confidence (%)
- **Severity** — high/medium/low
- **User Email** — Who made the detection
- **Created At** — When detected

---

## 🛡️ Security Features

✅ **What's Protected:**
- Admin login only accepts users with `role = "admin"`
- Non-admin users auto-redirected with error
- JWT role claim verified client-side AND server-side
- Token cleared on unauthorized access

✅ **No Easy Bypass:**
- Role cannot be changed from frontend
- Token is server-signed (backend-only)
- New users default to `role = "user"`
- Admin role set via `/admin/promote` only

---

## 🔍 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Unauthorized: Admin access only." | User doesn't have `role = "admin"`. Use `/admin/promote` |
| Page stuck on "Loading..." | Backend not running or JWT expired. Check console. |
| Can't see admin dashboard | JWT missing/invalid. Check `localStorage` in DevTools. |
| 401 on admin endpoints | JWT expired or role not included. Re-login. |

---

## 📝 FAQ

**Q: Can I change my role from admin dash?**  
A: No. Only backend admin can promote via `/admin/promote`.

**Q: What if I forget admin password?**  
A: Use `/admin/promote` with admin token to reset role for a different account.

**Q: Can I delete users from the dashboard?**  
A: Dashboard is read-only. Use backend API or database directly.

**Q: Is the admin token secure?**  
A: Keep `ADMIN_TOKEN` in `.env` secret. Use HTTPS in production.

---

## 🎯 Files Added

- `frontend/admin-login.html` — Login form
- `frontend/admin.html` — Dashboard
- `frontend/js/admin.js` — Auth logic
- `backend/app.py` (+2 endpoints) — User & detection listing

**All files are NEW. No existing files modified.**

---

## ⚡ Environment

Assumes servers running:
- **Backend:** `python backend/start_server.py` (port 8000)
- **Frontend:** `python frontend/serve.py` (port 8003)

---

**Status:** ✅ Ready to use. Test with `python test_admin_flow.py`

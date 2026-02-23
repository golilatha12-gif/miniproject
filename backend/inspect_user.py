import sqlite3
from pathlib import Path

def main(email):
    db = Path(__file__).resolve().parent / "riceguard.db"
    if not db.exists():
        print("DB not found:", db)
        return
    conn = sqlite3.connect(str(db))
    cur = conn.cursor()
    cur.execute("SELECT id, email, role, hashed_password, password FROM users WHERE email=?", (email,))
    row = cur.fetchone()
    if not row:
        print("User not found for", email)
    else:
        print("id:", row[0])
        print("email:", row[1])
        print("role:", row[2])
        print("hashed_password:", row[3])
        print("legacy_password_field:", row[4])
    conn.close()

if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print("Usage: python inspect_user.py <email>")
    else:
        main(sys.argv[1])

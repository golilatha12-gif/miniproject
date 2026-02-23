import sqlite3
from pathlib import Path

def main():
    db = Path(__file__).resolve().parent / "riceguard.db"
    if not db.exists():
        print("Database not found:", db)
        return
    conn = sqlite3.connect(str(db))
    cur = conn.cursor()
    try:
        cur.execute("SELECT email, role FROM users WHERE role='admin' OR role LIKE '%admin%'")
    except Exception as e:
        print("Query error:", e)
        conn.close()
        return
    rows = cur.fetchall()
    if not rows:
        print("No admin users found in the database.")
    else:
        for email, role in rows:
            print(f"{email}  ({role})")
    conn.close()

if __name__ == '__main__':
    main()

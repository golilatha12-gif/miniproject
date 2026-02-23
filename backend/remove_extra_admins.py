import sqlite3
from pathlib import Path
from datetime import datetime
import shutil

KEEP_EMAIL = 'admin123@gmail.com'

def main():
    db = Path(__file__).resolve().parent / "riceguard.db"
    if not db.exists():
        print("Database not found:", db)
        return

    # backup
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup = db.with_name(f"riceguard.db.bak_{ts}")
    shutil.copy(str(db), str(backup))
    print("Backup created:", backup)

    conn = sqlite3.connect(str(db))
    cur = conn.cursor()
    try:
        # Count admins before
        cur.execute("SELECT COUNT(*) FROM users WHERE role='admin' OR role LIKE '%admin%'")
        before = cur.fetchone()[0]

        # Delete admins except the one to keep
        cur.execute(
            "DELETE FROM users WHERE (role='admin' OR role LIKE '%admin%') AND email != ?",
            (KEEP_EMAIL,)
        )
        deleted = cur.rowcount
        conn.commit()

        # Count admins after
        cur.execute("SELECT email, role FROM users WHERE role='admin' OR role LIKE '%admin%'")
        rows = cur.fetchall()

        print(f"Admins before: {before}")
        print(f"Deleted rows: {deleted}")
        if not rows:
            print("No admin users remain.")
        else:
            print("Remaining admin users:")
            for email, role in rows:
                print(f"{email}  ({role})")

    except Exception as e:
        print("Error while modifying database:", e)
        conn.rollback()
    finally:
        conn.close()

if __name__ == '__main__':
    main()

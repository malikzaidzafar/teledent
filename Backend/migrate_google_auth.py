"""
migrate_google_auth.py — Migration to support Google OAuth.

Adds:
  - users.google_id  (VARCHAR 128, unique, nullable)
  - Makes users.hashed_password nullable (for Google-only accounts)

Run once:
    cd Backend
    python migrate_google_auth.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()

import psycopg2
from app.config import settings

DDL = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(128) UNIQUE;",
    "ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL;",
]


def run():
    url = settings.DATABASE_URL.replace("postgresql+psycopg2://", "postgresql://")
    conn = psycopg2.connect(url)
    conn.autocommit = True
    cur = conn.cursor()
    for stmt in DDL:
        print(f"  Running: {stmt}")
        try:
            cur.execute(stmt)
            print("    OK")
        except psycopg2.errors.DuplicateColumn:
            print("    Skipped (column already exists)")
        except Exception as e:
            print(f"    ERROR: {e}")
    cur.close()
    conn.close()
    print("Migration complete.")


if __name__ == "__main__":
    run()

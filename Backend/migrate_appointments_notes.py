"""
migrate_appointments_notes.py — Add missing `notes` column to appointments table.

Run once:
    cd Backend
    python migrate_appointments_notes.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()

import psycopg2
from app.config import settings

DDL = [
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS notes VARCHAR(2000);",
]


def run():
    url = settings.DATABASE_URL.replace("postgresql+psycopg2://", "postgresql://")
    conn = psycopg2.connect(url)
    conn.autocommit = True
    cur = conn.cursor()
    for stmt in DDL:
        print(f"  Running: {stmt}")
        cur.execute(stmt)
        print("    OK")
    cur.close()
    conn.close()
    print("\n✅  Migration complete.")


if __name__ == "__main__":
    run()

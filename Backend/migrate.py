"""
migrate.py — One-time migration to add new columns introduced in the
             AI-scan → auto-report feature.

Run once:
    cd Backend
    python migrate.py
"""
import os
import sys
from pathlib import Path

# Allow importing app config without a full FastAPI context
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()

import psycopg2
from app.config import settings


DDL = [
    # reports: make dentist_id nullable and add is_auto_generated
    "ALTER TABLE reports ALTER COLUMN dentist_id DROP NOT NULL;",
    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN NOT NULL DEFAULT FALSE;",

    # analyses: add ai_explanation JSONB column
    "ALTER TABLE analyses ADD COLUMN IF NOT EXISTS ai_explanation JSONB;",
]


def run():
    url = settings.DATABASE_URL
    # psycopg2 expects postgresql:// not postgresql+psycopg2://
    url = url.replace("postgresql+psycopg2://", "postgresql://")
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

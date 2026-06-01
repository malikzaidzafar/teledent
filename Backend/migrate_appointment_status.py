"""
migrate_appointment_status.py — Add missing 'pending' and 'no_show' values
                                 to the appointmentstatus enum in PostgreSQL.

Run once:
    cd Backend
    python migrate_appointment_status.py
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()

import psycopg2
from app.config import settings

# PostgreSQL does not support removing enum values, but supports adding them.
# We add any missing values safely with IF NOT EXISTS (pg >= 9.1 supports this
# via a DO block since ALTER TYPE ... ADD VALUE IF NOT EXISTS is pg 9.6+).
DDL = [
    "ALTER TYPE appointmentstatus ADD VALUE IF NOT EXISTS 'pending';",
    "ALTER TYPE appointmentstatus ADD VALUE IF NOT EXISTS 'no_show';",
    "ALTER TYPE appointmentstatus ADD VALUE IF NOT EXISTS 'confirmed';",
    "ALTER TYPE appointmentstatus ADD VALUE IF NOT EXISTS 'cancelled';",
    "ALTER TYPE appointmentstatus ADD VALUE IF NOT EXISTS 'completed';",
    "ALTER TYPE appointmenttype  ADD VALUE IF NOT EXISTS 'video_consultation';",
    "ALTER TYPE appointmenttype  ADD VALUE IF NOT EXISTS 'in_person';",
]


def run():
    url = settings.DATABASE_URL
    url = url.replace("postgresql+psycopg2://", "postgresql://")
    conn = psycopg2.connect(url)
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block
    conn.autocommit = True
    cur = conn.cursor()

    # First check what values already exist
    cur.execute("""
        SELECT t.typname, e.enumlabel
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname IN ('appointmentstatus', 'appointmenttype')
        ORDER BY t.typname, e.enumsortorder;
    """)
    rows = cur.fetchall()
    print("Current enum values in DB:")
    for row in rows:
        print(f"  {row[0]}: {row[1]}")
    print()

    for stmt in DDL:
        print(f"  Running: {stmt}")
        try:
            cur.execute(stmt)
            print("    OK")
        except psycopg2.errors.DuplicateObject:
            print("    Already exists, skipping.")

    cur.close()
    conn.close()
    print("\n✅  Migration complete.")


if __name__ == "__main__":
    run()

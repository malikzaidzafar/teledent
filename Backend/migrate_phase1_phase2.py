#!/usr/bin/env python3
"""
migrate_phase1_phase2.py
Adds the following to the existing database:
  1. appointments.notes column (Phase 1)
  2. appointment_reports junction table (Phase 2)
  3. video_sessions.status enum extended with ringing/declined/missed values (Phase 4)

Run from the Backend/ directory:
  python migrate_phase1_phase2.py
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import engine
from sqlalchemy import text

def run():
    with engine.connect() as conn:
        # 1. Add notes column to appointments
        try:
            conn.execute(text(
                "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS notes VARCHAR(2000)"
            ))
            print("✓ appointments.notes column added")
        except Exception as e:
            print(f"  appointments.notes: {e}")

        # 2. Extend video_session status enum (PostgreSQL-specific)
        try:
            conn.execute(text(
                "ALTER TYPE videosessionstatus ADD VALUE IF NOT EXISTS 'ringing'"
            ))
            conn.execute(text(
                "ALTER TYPE videosessionstatus ADD VALUE IF NOT EXISTS 'declined'"
            ))
            conn.execute(text(
                "ALTER TYPE videosessionstatus ADD VALUE IF NOT EXISTS 'missed'"
            ))
            print("✓ VideoSessionStatus enum values added: ringing, declined, missed")
        except Exception as e:
            print(f"  VideoSessionStatus enum: {e}")

        # 3. Create appointment_reports junction table
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS appointment_reports (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
                    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
                    shared_at TIMESTAMPTZ DEFAULT NOW(),
                    CONSTRAINT uq_appointment_report UNIQUE (appointment_id, report_id)
                )
            """))
            print("✓ appointment_reports table created")
        except Exception as e:
            print(f"  appointment_reports: {e}")

        conn.commit()
        print("\nMigration complete.")


if __name__ == "__main__":
    run()

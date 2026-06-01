"""
seed_admin.py — Creates a default admin user in the database.
Run once: cd Backend && python seed_admin.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()

from app.database import SessionLocal, Base, engine
from app.models.admin import Admin
from app.utils.utils import get_password_hash

# Ensure the admins table exists
Admin.__table__.create(bind=engine, checkfirst=True)

USERNAME = "admin"
EMAIL    = "admin@teledent.ai"
PASSWORD = "Admin@Teledent2026"

def seed():
    db = SessionLocal()
    try:
        existing = db.query(Admin).filter(Admin.username == USERNAME).first()
        if existing:
            print(f"✅  Admin '{USERNAME}' already exists — no changes made.")
            return

        admin = Admin(
            username=USERNAME,
            email=EMAIL,
            password=get_password_hash(PASSWORD),
        )
        db.add(admin)
        db.commit()
        print("\n🎉  Admin user created successfully!")
        print(f"   Username : {USERNAME}")
        print(f"   Email    : {EMAIL}")
        print(f"   Password : {PASSWORD}")
        print("\nLogin at: /admin/dashboard\n")
    finally:
        db.close()

if __name__ == "__main__":
    seed()

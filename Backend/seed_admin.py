"""
seed_admin.py — Creates a default admin user in the database.
Run once: cd Backend && python seed_admin.py
"""
import sys
import uuid
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()

from app.database import SessionLocal, engine
from app.models.admin import Admin
from app.models.user import User, UserRole
from app.utils.utils import get_password_hash

# Ensure the admins table exists (legacy table)
Admin.__table__.create(bind=engine, checkfirst=True)

USERNAME = "admin"
EMAIL    = "admin@teledent.ai"
PASSWORD = "Admin@Teledent2026"
FIRST    = "Super"
LAST     = "Admin"

def seed():
    db = SessionLocal()
    try:
        # 1. Seed into users table (used by frontend /auth/login)
        existing_user = db.query(User).filter(User.email == EMAIL).first()
        if existing_user:
            print(f"✅  Admin user '{EMAIL}' already exists in users table — no changes made.")
        else:
            admin_user = User(
                id=uuid.uuid4(),
                email=EMAIL,
                hashed_password=get_password_hash(PASSWORD),
                first_name=FIRST,
                last_name=LAST,
                role=UserRole.admin,
                is_active=True,
                is_email_verified=True,
            )
            db.add(admin_user)
            db.commit()
            print("\n🎉  Admin user created in users table (frontend login)!")

        # 2. Seed into admins table (used by /admin/login API route)
        existing_admin = db.query(Admin).filter(Admin.username == USERNAME).first()
        if existing_admin:
            print(f"✅  Admin '{USERNAME}' already exists in admins table — no changes made.")
        else:
            admin = Admin(
                username=USERNAME,
                email=EMAIL,
                password=get_password_hash(PASSWORD),
            )
            db.add(admin)
            db.commit()
            print("🎉  Admin user created in admins table (API route)!")

        print(f"\n   Email    : {EMAIL}")
        print(f"   Password : {PASSWORD}")
        print("\nLogin at: /login  →  will redirect to /admin/dashboard\n")
    finally:
        db.close()

if __name__ == "__main__":
    seed()

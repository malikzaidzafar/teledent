# Import all models so SQLAlchemy's metadata is fully populated
# before Base.metadata.create_all() is called in main.py.
from app.models.user import User, UserRole  # noqa: F401
from app.models.patient import Patient  # noqa: F401
from app.models.dentist import Dentist  # noqa: F401
from app.models.scan import Scan, ScanType, ScanStatus  # noqa: F401
from app.models.analysis import Analysis, AnalysisStatus  # noqa: F401
from app.models.appointment import Appointment, AppointmentType, AppointmentStatus  # noqa: F401
from app.models.report import Report  # noqa: F401
from app.models.video_session import VideoSession, VideoSessionStatus  # noqa: F401
from app.models.message import Conversation, Message  # noqa: F401
from app.models.notification import Notification  # noqa: F401
from app.models.payment import Payment, PaymentStatus  # noqa: F401
from app.models.appointment_report import AppointmentReport  # noqa: F401

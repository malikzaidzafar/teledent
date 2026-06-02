"""
routers/messages.py — Conversation and Message endpoints.
"""
import uuid
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.core.dependencies import get_current_user
from app.core.exceptions import NotFoundException, ForbiddenException
from app.models.message import Conversation, Message
from app.models.user import User

router = APIRouter(prefix="/messages", tags=["Messages"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ConversationOut(BaseModel):
    id: str
    patient_id: str
    dentist_id: str
    created_at: str
    other_user_name: Optional[str] = None

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    text: str
    is_read: bool
    sent_at: str

    class Config:
        from_attributes = True


class SendMessageIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)


class CreateConversationIn(BaseModel):
    other_user_id: str  # dentist_id if patient is creating, patient_id if dentist


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_conversation_or_404(db: Session, conversation_id: str) -> Conversation:
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise NotFoundException("Conversation", conversation_id)
    return conv


def _assert_participant(conv: Conversation, user: User):
    if str(conv.patient_id) != str(user.id) and str(conv.dentist_id) != str(user.id):
        raise ForbiddenException("You are not a participant of this conversation.")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=list[ConversationOut])
def list_conversations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return all conversations for the authenticated user."""
    convs = db.query(Conversation).filter(
        (Conversation.patient_id == current_user.id) |
        (Conversation.dentist_id == current_user.id)
    ).order_by(Conversation.created_at.desc()).all()

    out = []
    for c in convs:
        other_user_id = c.dentist_id if current_user.role == "patient" else c.patient_id
        other_user = db.query(User).filter(User.id == other_user_id).first()
        other_name = f"{other_user.first_name} {other_user.last_name}" if other_user else "Unknown"

        out.append(ConversationOut(
            id=str(c.id),
            patient_id=str(c.patient_id),
            dentist_id=str(c.dentist_id),
            created_at=c.created_at.isoformat(),
            other_user_name=other_name
        ))
    return out


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ConversationOut)
def create_conversation(
    body: CreateConversationIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new conversation between patient and dentist.
    The caller's role determines which side they are on.
    """
    from app.models.patient import Patient
    
    if current_user.role == "patient":
        patient_id = current_user.id
        dentist_id = body.other_user_id
    elif current_user.role == "dentist":
        dentist_id = current_user.id
        # The frontend passes the Patient ID (not User ID), so resolve it.
        patient_record = db.query(Patient).filter(Patient.id == body.other_user_id).first()
        if patient_record:
            patient_id = patient_record.user_id
        else:
            patient_id = body.other_user_id
    else:
        # admin — provide both; other_user_id is the patient, you need a separate field
        raise ForbiddenException("Admins cannot create conversations directly.")

    # Return existing conversation if one already exists
    existing = db.query(Conversation).filter(
        Conversation.patient_id == patient_id,
        Conversation.dentist_id == dentist_id,
    ).first()
    
    def _get_other_name(conv):
        other_uid = conv.dentist_id if current_user.role == "patient" else conv.patient_id
        ou = db.query(User).filter(User.id == other_uid).first()
        return f"{ou.first_name} {ou.last_name}" if ou else "Unknown"

    if existing:
        return ConversationOut(
            id=str(existing.id),
            patient_id=str(existing.patient_id),
            dentist_id=str(existing.dentist_id),
            created_at=existing.created_at.isoformat(),
            other_user_name=_get_other_name(existing)
        )

    conv = Conversation(id=uuid.uuid4(), patient_id=patient_id, dentist_id=dentist_id)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return ConversationOut(
        id=str(conv.id),
        patient_id=str(conv.patient_id),
        dentist_id=str(conv.dentist_id),
        created_at=conv.created_at.isoformat(),
        other_user_name=_get_other_name(conv)
    )


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conv = _get_conversation_or_404(db, conversation_id)
    _assert_participant(conv, current_user)
    
    other_uid = conv.dentist_id if current_user.role == "patient" else conv.patient_id
    ou = db.query(User).filter(User.id == other_uid).first()
    other_name = f"{ou.first_name} {ou.last_name}" if ou else "Unknown"
    
    return ConversationOut(
        id=str(conv.id),
        patient_id=str(conv.patient_id),
        dentist_id=str(conv.dentist_id),
        created_at=conv.created_at.isoformat(),
        other_user_name=other_name
    )


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
def list_messages(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conv = _get_conversation_or_404(db, conversation_id)
    _assert_participant(conv, current_user)

    msgs = (
        db.query(Message)
        .filter(Message.conversation_id == conv.id)
        .order_by(Message.sent_at.asc())
        .all()
    )

    # Mark unread messages as read
    for m in msgs:
        if not m.is_read and str(m.sender_id) != str(current_user.id):
            m.is_read = True
    db.commit()

    return [
        MessageOut(
            id=str(m.id),
            conversation_id=str(m.conversation_id),
            sender_id=str(m.sender_id),
            text=m.text,
            is_read=m.is_read,
            sent_at=m.sent_at.isoformat(),
        )
        for m in msgs
    ]


@router.post("/{conversation_id}/messages", status_code=status.HTTP_201_CREATED, response_model=MessageOut)
def send_message(
    conversation_id: str,
    body: SendMessageIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conv = _get_conversation_or_404(db, conversation_id)
    _assert_participant(conv, current_user)

    msg = Message(
        id=uuid.uuid4(),
        conversation_id=conv.id,
        sender_id=current_user.id,
        text=body.text,
        is_read=False,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return MessageOut(
        id=str(msg.id),
        conversation_id=str(msg.conversation_id),
        sender_id=str(msg.sender_id),
        text=msg.text,
        is_read=msg.is_read,
        sent_at=msg.sent_at.isoformat(),
    )


@router.get("/{conversation_id}/unread-count")
def unread_count(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conv = _get_conversation_or_404(db, conversation_id)
    _assert_participant(conv, current_user)
    count = (
        db.query(Message)
        .filter(
            Message.conversation_id == conv.id,
            Message.sender_id != current_user.id,
            Message.is_read == False,
        )
        .count()
    )
    return {"conversation_id": conversation_id, "unread": count}

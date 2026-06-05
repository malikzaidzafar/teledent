"""
routers/notifications.py — In-app notification endpoints.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.dependencies import get_current_user
from app.models.notification import Notification

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("")
def list_notifications(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Notification).filter(Notification.user_id == str(current_user.id))
    if unread_only:
        q = q.filter(Notification.is_read == False)
    total = q.count()
    items = q.order_by(Notification.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return {
        "data": [
            {
                "id": str(n.id),
                "type": n.type,
                "title": n.title,
                "body": n.body,
                "data": n.data,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in items
        ],
        "total": total,
        "unread": db.query(Notification).filter(
            Notification.user_id == str(current_user.id),
            Notification.is_read == False,
        ).count(),
        "page": page,
        "limit": limit,
    }


@router.post("/{notification_id}/read")
def mark_read(
    notification_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notif = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == str(current_user.id),
    ).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {"message": "Marked as read."}


@router.post("/read-all")
def mark_all_read(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(Notification).filter(
        Notification.user_id == str(current_user.id),
        Notification.is_read == False,
    ).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read."}


@router.get("/counts")
def notification_counts(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return separate unread counts for appointments and messages notifications."""
    appointment_types = [
        "appointment.booked", "appointment.new_request", "appointment.confirmed",
        "appointment.cancelled", "appointment.completed", "appointment.reminder",
        "call.started", "call.missed",
    ]
    message_types = ["message.new"]

    appt_count = db.query(Notification).filter(
        Notification.user_id == str(current_user.id),
        Notification.is_read == False,
        Notification.type.in_(appointment_types),
    ).count()

    msg_count = db.query(Notification).filter(
        Notification.user_id == str(current_user.id),
        Notification.is_read == False,
        Notification.type.in_(message_types),
    ).count()

    return {"appointments": appt_count, "messages": msg_count, "total": appt_count + msg_count}

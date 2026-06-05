"""
routers/ws.py — WebSocket endpoint for real-time notifications.

Clients connect with a JWT token as a query parameter:
  ws://host/ws/notifications?token=<access_token>

The server pushes JSON events:
  { "type": "incoming_call", "appointment_id": "...", "session_id": "...", "caller_name": "...", "caller_id": "..." }
  { "type": "call_declined", "appointment_id": "...", "session_id": "..." }
  { "type": "call_missed",   "appointment_id": "...", "session_id": "..." }
  { "type": "new_message",   "conversation_id": "...", "sender_name": "...", "preview": "..." }
  { "type": "notification",  "title": "...", "body": "..." }
"""
import asyncio
import logging
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.core.security import decode_token

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])

# ---------------------------------------------------------------------------
# Connection manager — maintains a dict of user_id → set of active websockets
# ---------------------------------------------------------------------------

class ConnectionManager:
    def __init__(self):
        self._connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self._connections.setdefault(user_id, set()).add(ws)
        logger.info("WS connect: user=%s, total_connections=%d", user_id, len(self._connections[user_id]))

    def disconnect(self, user_id: str, ws: WebSocket):
        if user_id in self._connections:
            self._connections[user_id].discard(ws)
            if not self._connections[user_id]:
                del self._connections[user_id]
        logger.info("WS disconnect: user=%s", user_id)

    async def send(self, user_id: str, data: dict):
        """Send a JSON event to all active connections for a user."""
        connections = self._connections.get(user_id, set())
        if not connections:
            logger.warning("WS send: user=%s has NO active connections — event '%s' will be missed!", user_id, data.get("type"))
            return
        logger.info("WS send: user=%s, event='%s', connections=%d", user_id, data.get("type"), len(connections))
        dead = set()
        for ws in connections:
            try:
                await ws.send_json(data)
                logger.info("WS send: successfully delivered '%s' to user=%s", data.get("type"), user_id)
            except Exception as exc:
                logger.warning("WS send: failed to deliver to user=%s: %s", user_id, exc)
                dead.add(ws)
        for ws in dead:
            self._connections.get(user_id, set()).discard(ws)

    def is_connected(self, user_id: str) -> bool:
        return bool(self._connections.get(user_id))


# Singleton — shared across all requests
manager = ConnectionManager()


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@router.websocket("/ws/notifications")
async def ws_notifications(
    websocket: WebSocket,
    token: str = Query(...),
):
    """Real-time notification channel. Authenticate via ?token=<JWT>."""
    # Decode token
    payload = decode_token(token)
    if not payload or not payload.get("sub"):
        await websocket.close(code=4001)
        return

    user_id = str(payload["sub"])
    await manager.connect(user_id, websocket)

    try:
        # Keep connection alive; client may send pings
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=30)
                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except asyncio.TimeoutError:
                # Send keepalive ping
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("WS error for user %s: %s", user_id, exc)
    finally:
        manager.disconnect(user_id, websocket)

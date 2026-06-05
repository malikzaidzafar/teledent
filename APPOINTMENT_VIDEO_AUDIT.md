# Teledent — Appointment & Video Consultation Audit Report

**Date:** June 4, 2026  
**Reviewer:** Senior Engineering Review  
**Scope:** Full appointment lifecycle, video calling, notifications, UI consistency

---

## Executive Summary

The appointment and video consultation system has significant **backend crashes** (NameError exceptions), **missing real-time notification infrastructure**, a **broken badge counter** in the sidebar, and **video/audio issues** stemming from LiveKit configuration gaps. Below is a categorized breakdown of all identified issues with severity ratings and recommended fixes.

---

## 🔴 CRITICAL — Backend Crashes (500 Errors)

### 1. `NameError: name 'User' is not defined` in `appointment_service.py`

**Location:** `Backend/app/services/appointment_service.py` — lines using `db.query(User)`  
**Impact:** `POST /appointments/{id}/accept` and `POST /appointments/{id}/reject` return **500 Internal Server Error**  
**Root Cause:** The `User` model is never imported at the top of the file.

**Fix:**
```python
# Add at top of appointment_service.py
from app.models.user import User
```

### 2. `NameError: name 'logger' is not defined` in `appointment_service.py`

**Location:** Every `except` block in `appointment_service.py` (create, cancel, accept, reject, complete)  
**Impact:** After the `User` NameError is triggered, Python enters the `except` handler which itself crashes on `logger`, causing an unhandled exception chain → 500.  
**Root Cause:** `logger` is never defined in this module.

**Fix:**
```python
# Add at top of appointment_service.py
import logging
logger = logging.getLogger(__name__)
```

### 3. Missing imports for `email_service` and `notification_service`

**Location:** `appointment_service.py` — all notification/email try-blocks  
**Root Cause:** These services are referenced but never imported.

**Fix:**
```python
from app.services import email_service, notification_service
```

---

## 🔴 CRITICAL — Video/Audio Not Working for Remote Participant

### 4. LiveKit Configuration Likely Missing or Misconfigured

**Symptoms:** Local video shows, but remote participant video/audio is invisible.  
**Possible Causes:**

| Cause | Evidence |
|-------|----------|
| `LIVEKIT_URL` not set or wrong | Token is generated but client can't connect to server |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` mismatch | Tokens are invalid → server rejects the 2nd participant |
| LiveKit server not running / unreachable | Self-hosted LiveKit Cloud instance down |
| TURN/STUN not configured | NAT traversal fails → WebRTC ICE candidates fail in production |
| Both participants get tokens for **different rooms** | Room name mismatch due to session duplication bug |

**Diagnosis Steps:**
1. Check browser console for `livekit-client` connection errors / ICE failures
2. Verify `LIVEKIT_URL` is a `wss://` URL reachable from the client browser
3. Confirm both participants receive the **same `room_name`** in `/video/sessions/{id}/token` response
4. Verify LiveKit Cloud dashboard shows both participants joining the same room

### 5. Screen Share Disabled for Patients

**Location:** `VideoRoom.tsx` line ~280: `screenShare: role === "dentist"`  
**Impact:** Only dentists can screen share. If a patient needs to show something, they cannot.  
**Recommendation:** Enable for both roles or make it configurable.

---

## 🟠 HIGH — Sidebar Badge "9+" Bug

### 6. Unread Count Shows on Wrong Items & Flickers on Navigation

**Location:** `Frontend/components/common/Sidebar.tsx` lines 57–63, 90–95  
**Root Cause (Multiple Issues):**

1. **Single `unreadCount` used for BOTH "Appointments" and "Messages"** — The sidebar fetches `notificationApi.list(1, true)` which returns *all* unread notifications. This count is shown on both "Appointments" and "Messages" nav items identically. If you have 0 unread messages but 10 unread appointment notifications, "Messages" still shows "9+".

2. **Badge flickers on page switch** — `useState(0)` resets to 0 on component mount (route change causes re-render), then the `useEffect` fetches and sets the real value. This causes a visible 0 → 9+ flash.

3. **Polling interval too slow (30s)** — After marking notifications as read, the sidebar badge persists for up to 30 seconds.

**Fix:**
- Separate the counts: fetch unread notifications filtered by type (`appointment.*` vs `message.*`)
- Or better: create a dedicated `GET /notifications/counts` endpoint returning `{ appointments: N, messages: M }`
- Initialize state from a context/cache to prevent flicker
- Reduce polling to 10s or use SSE/WebSocket for real-time updates

---

## 🟠 HIGH — No Call Notification to Other Participant

### 7. No "Incoming Call" Notification System

**Current Flow:**
1. Patient/Dentist clicks "Join Call"
2. Frontend creates a video session (`POST /video/sessions`)
3. Frontend gets a token and connects to LiveKit room
4. **The other participant has NO idea the call started**

**What's Missing:**
- No real-time push notification (WebSocket/SSE) to alert the other party
- No "Incoming Call" UI (accept/decline modal)
- No ringing state or timeout
- No "missed call" handling

**Recommended Architecture:**
```
Participant A clicks "Join Call"
  → POST /video/sessions (creates room)
  → Backend sends WebSocket/SSE event to Participant B:
    { type: "incoming_call", appointment_id, caller_name, session_id }
  → Participant B sees "Incoming Call" modal with Accept/Decline
  → Accept: navigates to /video?session_id=X, gets token, joins room
  → Decline: POST /video/sessions/{id}/end + notification back to A
  → Timeout (60s): auto-decline, mark as "missed"
```

**Required New Components:**
- Backend: WebSocket/SSE endpoint for real-time events
- Backend: `POST /video/sessions/{id}/ring` endpoint
- Frontend: Global `IncomingCallModal` component (rendered in layout)
- Frontend: WebSocket connection manager (persistent across pages)
- Model: `call_status` field on VideoSession (`ringing` | `active` | `declined` | `missed` | `ended`)

---

## 🟠 HIGH — Video Call UI Inconsistency

### 8. Video Page Styling Doesn't Match App Design System

**Issues:**
- LiveKit's default `@livekit/components-react` theme (`data-lk-theme="default"`) uses its own CSS variables (dark theme, specific border-radius, colors) that clash with Teledent's design system
- The video grid uses hardcoded `#0f172a` background instead of `var(--surface)` or theme tokens
- ControlBar uses LiveKit's built-in styles which don't match the app's button styles
- No page header/breadcrumb consistent with other pages
- Notes panel uses inline styles rather than the app's CSS class system

**Recommendations:**
- Override LiveKit CSS variables to match Teledent's design tokens
- Add a consistent page header (`Video Consultation — Dr. Name`)
- Wrap the entire video page in the standard page layout (with sidebar visible)
- Style the ControlBar buttons to match the app's `.btn` / `.btn-primary` styles
- Add participant name labels, call duration timer, and connection quality indicators

---

## 🟡 MEDIUM — Appointment Flow Gaps

### 9. No Appointment Reminder System

- No cron job or scheduler sends reminders before appointments
- No email/notification 15 min or 1 hour before the call
- Risk of no-shows

### 10. No "Reschedule" Flow

- Patient can only cancel, not reschedule
- `PatientUpdateAppointmentIn` schema allows `scheduled_at` but there's no proper reschedule logic (re-validate slot, notify dentist, etc.)

### 11. Appointment `notes` Field Missing from Model

- `appointment_service.py` does `if hasattr(appt, "notes"): appt.notes = ...`
- The `Appointment` model in `models/appointment.py` has **no `notes` column**
- Clinical notes from video sessions and rejection reasons are silently lost

### 12. No "No-Show" Detection

- `AppointmentStatus.no_show` exists in the enum but nothing ever sets it
- Need: if appointment time passes + 15 min and no video session was created → auto-mark as no-show

### 13. Slot Overlap Check Uses Hardcoded 30 Minutes

```python
(Appointment.scheduled_at + timedelta(minutes=30)) > scheduled_at
```
Should use the actual `duration_min` of existing appointments, not hardcoded 30.

---

## 🟡 MEDIUM — Notification System Limitations

### 14. No Real-Time Delivery (Polling Only)

- Frontend polls every 30 seconds — user may miss time-sensitive events (incoming call!)
- No WebSocket or Server-Sent Events (SSE) infrastructure
- Critical for video call invitations

### 15. No Notification for "Call Started"

- When a video session is created, no notification is sent to the other party
- The `notification_service.py` has no `notify_call_started()` function

### 16. Notifications Not Separated by Category

- Single unread count conflates appointments, messages, calls, system alerts
- Sidebar badge is misleading (shows on both Appointments and Messages)

---

## 🟡 MEDIUM — Security & Robustness

### 17. No Rate Limiting on Video Session Creation

- A malicious user could spam `POST /video/sessions` and create hundreds of LiveKit rooms
- Add rate limiting similar to appointment creation

### 18. No Token Refresh Mechanism

- LiveKit token has 2-hour TTL but no client-side refresh logic
- Long consultations will disconnect without warning

### 19. Video Session Not Cleaned Up on Browser Close

- If user closes browser tab, session stays "active" forever
- Need: heartbeat mechanism or LiveKit webhook to detect participant departure

---

## 🟢 LOW — Quality of Life

### 20. PreJoin Screen Shows Every Time

- No "remember my settings" between sessions (though `persistUserChoices` is set, it may not persist across page navigations in Next.js)

### 21. No Call Duration Display During Call

- `startedAt` is tracked but never rendered to the user
- Add a timer display in the control bar

### 22. No Call Quality Indicator

- LiveKit provides connection quality events but they're not surfaced to the user
- Add a signal strength indicator

### 23. `join_url` Field on Appointment is Unused

- Set to `None` on creation, never populated
- Either populate with the video page URL or remove from schema

---

## 📋 Priority Fix Order

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1 | Add `User`, `logger`, service imports to `appointment_service.py` | 5 min | Unblocks accept/reject/all notifications |
| 2 | Fix sidebar badge (separate counts, prevent flicker) | 1 hr | Stops misleading "9+" |
| 3 | Add `notes` column to Appointment model + migration | 30 min | Clinical notes actually persist |
| 4 | Verify LiveKit configuration (URL, keys, TURN) | 1 hr | Fixes remote video/audio |
| 5 | Add "call started" notification | 2 hr | Other party knows call began |
| 6 | Implement WebSocket/SSE for real-time notifications | 1 day | Enables incoming call flow |
| 7 | Build "Incoming Call" UI modal | 1 day | Complete call flow |
| 8 | Restyle video page to match app design | 4 hr | UI consistency |
| 9 | Add appointment reminders (cron/scheduler) | 4 hr | Reduces no-shows |
| 10 | Fix slot overlap check to use actual duration | 15 min | Correct booking logic |

---

## Summary of Immediate Fixes Needed

```
Backend/app/services/appointment_service.py:
  + import logging
  + from app.models.user import User
  + from app.services import email_service, notification_service
  + logger = logging.getLogger(__name__)

Frontend/components/common/Sidebar.tsx:
  - Use single unreadCount for both Appointments & Messages badges
  + Separate notification counts by category OR only show on relevant item
  + Initialize from cached value to prevent flicker

Backend/app/models/appointment.py:
  + notes = Column(String(2000), nullable=True)  # Add notes column

LiveKit:
  - Verify LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET in .env
  - Verify LiveKit server is accessible from client browsers (not just backend)
  - Check TURN server configuration for NAT traversal
```

---

## 🔴 CRITICAL — Duplicate Appointment Booking Allowed

### 24. Patient Can Book Same Dentist at Same Time Multiple Times

**Location:** `Backend/app/services/appointment_service.py` → `_check_slot_available()`  
**Root Cause:** The slot-overlap check only validates the **dentist's** schedule. It does NOT check if the **patient** already has a booking at that time. A patient can book the same dentist at the same time repeatedly (creating duplicates), or book multiple dentists at overlapping times.

**Missing Validations:**
1. Patient cannot have two appointments at the same time (regardless of dentist)
2. Patient cannot book the same dentist+time combination twice
3. Patient should not be able to book a new appointment with the same dentist if they already have a pending/confirmed one (debatable but prevents spam)

**Fix Required:**
```python
def _check_patient_slot(db, patient_id, scheduled_at, duration_min):
    end_at = scheduled_at + timedelta(minutes=duration_min)
    overlap = db.query(Appointment).filter(
        Appointment.patient_id == patient_id,
        Appointment.status.in_([AppointmentStatus.pending, AppointmentStatus.confirmed]),
        Appointment.scheduled_at < end_at,
        (Appointment.scheduled_at + timedelta(minutes=duration_min)) > scheduled_at,
    ).first()
    if overlap:
        raise ConflictException("You already have an appointment at this time.")
```

---

## 🟠 HIGH — No Report Sharing Control for Appointments

### 25. Patient Cannot Choose Which Reports to Share with Dentist

**Current State:**
- When a dentist has ANY appointment (pending/confirmed/completed) with a patient, they can see ALL of that patient's reports (via `list_reports` and `get_report` in `report_service.py`)
- Patient has zero control over what medical data their dentist sees
- No consent mechanism or report-selection during booking

**What's Needed:**
- During appointment booking, patient should be able to select specific reports/scans to share
- A "shared_reports" junction table linking appointments to reports
- Dentist should only see reports explicitly shared for that appointment
- Patient should be able to add/remove shared reports after booking

### 26. Dentist Report Viewing is Too Broad

**Current Logic (report_service.py `list_reports`):**
```python
# Dentist sees ALL reports from ANY patient they have ANY appointment with
linked_patient_ids = [a.patient_id for a in db.query(Appointment).filter(...)]
q = q.filter(Report.patient_id.in_(linked_patient_ids))
```

**Problem:** If a dentist had a single completed appointment 6 months ago, they can still see all of that patient's current reports. No time-bounding, no explicit consent.

---

## � CRITICAL — `admin.py` Router Never Mounted (Dead Endpoints)

### 27. Admin Management Endpoints Are Unreachable (404)

**Location:** `Backend/app/main.py` line 26  
**Evidence:**
```python
from app.routers import auth, patients, scans, reports, appointments, video, files, dentists, admin_stats, messages, payments, notifications
```
The file `Backend/app/routers/admin.py` defines a router with endpoints (`/admin/login`, `/admin/get_all_patients`, `/admin/deletepatient/{id}`, `/admin/patients/{id}/images`) but is **never imported or included** in `main.py`. These endpoints return 404 at runtime.

**Fix:** Add `admin` to the import and include `admin.router` in the app.

---

## 🟠 HIGH — No Global Unread Messages Count

### 28. Sidebar Messages Badge Requires N+1 API Calls

**Current State:** The messages API only has `getUnreadCount(conversationId)` — a per-conversation endpoint. There is **no** `GET /messages/unread-total` endpoint. The sidebar calls the notification API (which covers appointment notifications) and applies that same count to the Messages badge. This means:
- The "Messages" badge number is actually showing **notification** count, not unread message count
- There's no efficient way to get total unread messages without fetching every conversation

**Fix:** Add `GET /messages/unread-total` backend endpoint that returns sum of unread messages across all conversations.

---

## 🟠 HIGH — `forgot_password` Has No Error Handling

### 29. Email Failure in `forgot_password` Crashes the Endpoint

**Location:** `Backend/app/services/auth_service.py` line 117  
**Code:**
```python
def forgot_password(db: Session, email: str):
    user = db.query(User).filter(User.email == email).first()
    if user:
        token = create_reset_token(str(user.id))
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        from app.services.email_service import send_reset_email
        send_reset_email(user.email, reset_url)  # ← No try/except! Crashes on SMTP failure
```
If the email service is down or misconfigured, `forgot_password` raises an unhandled exception → 500 to the user AND reveals the email exists (defeating the enumeration protection).

**Fix:** Wrap in try/except, log the error, always return success.

---

## 🟡 MEDIUM — Chat/Messaging Has Zero Real-Time Capability

### 30. Messages Require Manual Page Refresh

The messaging system is pure REST. There is:
- No WebSocket for live message delivery
- No polling interval on the messages page
- No "typing indicator"
- No push notification for new messages

The plan covers WebSocket for video call notifications (Phase 4) — this should be extended to cover chat messages too.

---

## 🟡 MEDIUM — Booking Page Performance Issues

### 31. N Parallel API Calls on Date Change

**Location:** `Frontend/app/patient/book/page.tsx`  
When the user changes the date picker, the frontend fires a slot-availability API call for **every visible dentist** simultaneously. With 20 dentists, that's 20 parallel requests with no debounce. Effect also re-fires on search/filter changes due to unstable dependency on `filteredDentists.length`.

**Fix:** Debounce date changes (300ms), only fetch slots for the selected dentist (not all visible ones), stabilize effect dependencies.

---

## 🟡 MEDIUM — Video Page Auto-Redirect Race Condition

### 32. 8-Second Auto-Redirect After Disconnect Conflicts with Manual Navigation

**Location:** `Frontend/app/patient/video/page.tsx`  
After disconnect, a `setTimeout(8000)` redirects to appointments. If the user clicks the "Back to Appointments" link before 8s, both navigations fire. No cleanup of the timeout on unmount.

**Fix:** Clear timeout on component unmount and on manual navigation.

---

## �📐 COMPLETE PHASED IMPLEMENTATION PLAN

---

### PHASE 1: Critical Backend Fixes (Day 1)
*Unblock the system — fix crashes and prevent duplicate bookings*

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 1.1 | Add missing imports (`User`, `logger`, `email_service`, `notification_service`) to `appointment_service.py` | `Backend/app/services/appointment_service.py` | 15 min |
| 1.2 | Add patient slot overlap validation in `create_appointment` | `Backend/app/services/appointment_service.py` | 30 min |
| 1.3 | Fix dentist slot check to use actual `duration_min` instead of hardcoded 30 | `Backend/app/services/appointment_service.py` | 10 min |
| 1.4 | Add `notes` column to Appointment model + DB migration | `Backend/app/models/appointment.py` | 20 min |
| 1.5 | Verify LiveKit env vars (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) are set and reachable | `.env` / deployment config | 30 min |
| 1.6 | **Mount `admin.py` router** — add `admin` to import in `main.py` and include `admin.router` | `Backend/app/main.py` | 5 min |
| 1.7 | **Wrap `forgot_password` email call** in try/except to prevent crash on SMTP failure | `Backend/app/services/auth_service.py` | 10 min |

**Deliverable:** Accept/reject works, no duplicate bookings, notes persist.

---

### PHASE 2: Report Sharing System (Days 2–3)
*Give patients control over what dentists see*

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 2.1 | Create `AppointmentReport` junction model (`appointment_id` + `report_id` + `shared_at`) | New: `Backend/app/models/appointment_report.py` | 30 min |
| 2.2 | DB migration for `appointment_reports` table | Migration script | 15 min |
| 2.3 | Create API endpoints: `POST /appointments/{id}/reports` (share), `DELETE /appointments/{id}/reports/{report_id}` (unshare), `GET /appointments/{id}/reports` (list shared) | New/update: `Backend/app/routers/appointments.py` | 1.5 hr |
| 2.4 | Update `create_appointment` to accept optional `report_ids: List[str]` in request body | `Backend/app/services/appointment_service.py` | 30 min |
| 2.5 | **Restrict dentist report access**: Replace broad patient-link query with appointment-scoped shared reports | `Backend/app/services/report_service.py` | 1 hr |
| 2.6 | Frontend: Add report selection UI in booking flow (checkbox list of patient's reports) | `Frontend/app/patient/book/page.tsx` | 2 hr |
| 2.7 | Frontend: Add "Manage Shared Reports" button on appointment detail | `Frontend/app/patient/appointments/page.tsx` | 1.5 hr |
| 2.8 | Frontend: Dentist appointment detail shows shared reports with view/download links | `Frontend/app/dentist/appointments/` | 2 hr |

**Deliverable:** Patient selects reports during booking; dentist only sees shared reports for that specific appointment.

**Data Model:**
```
appointment_reports
├── id (UUID, PK)
├── appointment_id (FK → appointments.id)
├── report_id (FK → reports.id)
├── shared_at (timestamp)
└── UNIQUE(appointment_id, report_id)
```

**API Contract:**
```
POST   /appointments/{id}/reports        { report_ids: ["uuid1", "uuid2"] }
GET    /appointments/{id}/reports         → [{ report_id, final_diagnosis, created_at, pdf_url }]
DELETE /appointments/{id}/reports/{rid}   → 204
```

---

### PHASE 3: Notification & Sidebar Fix (Days 3–4)
*Fix the "9+" badge and add call notifications*

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 3.1 | Create `GET /notifications/counts` endpoint → `{ appointments: N, messages: M, total: N }` | `Backend/app/routers/notifications.py` | 45 min |
| 3.2 | Create `GET /messages/unread-total` endpoint → `{ unread: N }` (sum across all conversations) | `Backend/app/routers/messages.py` | 45 min |
| 3.3 | Fix sidebar to use **separate** counts: notification count for Appointments, messages unread for Messages | `Frontend/components/common/Sidebar.tsx` | 1 hr |
| 3.4 | Fix badge flicker: cache last known count in localStorage, initialize state from it | `Frontend/components/common/Sidebar.tsx` | 30 min |
| 3.5 | Add `notify_call_started()` to notification_service — creates notification when video session is created | `Backend/app/services/notification_service.py` + `video_service.py` | 45 min |
| 3.6 | Reduce polling interval to 10s for notifications | `Frontend/components/common/Sidebar.tsx` | 5 min |

**Deliverable:** Badge shows correct per-section counts, no flicker, other party gets "Call Started" notification.

---

### PHASE 4: Real-Time Incoming Call System (Days 5–7)
*WebSocket-based call ringing, accept/decline, AND live chat*

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 4.1 | Add WebSocket endpoint `WS /ws/notifications` with JWT auth | New: `Backend/app/routers/ws.py` | 3 hr |
| 4.2 | Add `call_status` field to VideoSession model (`ringing` / `active` / `declined` / `missed` / `ended`) | `Backend/app/models/video_session.py` | 20 min |
| 4.3 | When video session created → send WS event `{ type: "incoming_call", ... }` to other participant | `Backend/app/services/video_service.py` | 1.5 hr |
| 4.4 | Add `POST /video/sessions/{id}/decline` endpoint | `Backend/app/routers/video.py` | 30 min |
| 4.5 | Add 60-second timeout → auto-mark as `missed` if not accepted | `Backend/app/services/video_service.py` | 1 hr |
| 4.6 | Frontend: Create `WebSocketProvider` context (persistent connection across pages) | New: `Frontend/lib/websocket-context.tsx` | 2 hr |
| 4.7 | Frontend: Create `IncomingCallModal` component (shows caller name, Accept/Decline, plays ringtone) | New: `Frontend/components/common/IncomingCallModal.tsx` | 3 hr |
| 4.8 | Frontend: Wire modal into root layout so it works from any page | `Frontend/app/layout.tsx` | 30 min |
| 4.9 | Frontend: On Accept → navigate to video page; On Decline → call decline API | `Frontend/components/common/IncomingCallModal.tsx` | 1 hr |
| 4.10 | **Extend WS for live chat**: send new-message events via WS so messages page updates in real-time | `Backend/app/routers/ws.py` + `Frontend/app/*/messages/` | 2 hr |

**Deliverable:** Full incoming call UX — other participant sees ringing modal with accept/decline, 60s timeout for missed calls.

**Flow Diagram:**
```
Patient clicks "Join Call"
  → POST /video/sessions { appointment_id }
  → Backend creates session (status: ringing)
  → Backend sends WS to dentist: { type: "incoming_call", appointment_id, caller: "John Doe", session_id }
  → Dentist sees IncomingCallModal with ringing sound
  
  Accept path:
    → Dentist clicks Accept
    → Frontend navigates to /dentist/video?session_id=X
    → Both get tokens, both join LiveKit room
    → Session status → active
  
  Decline path:
    → Dentist clicks Decline
    → POST /video/sessions/{id}/decline
    → WS event to patient: { type: "call_declined" }
    → Patient sees "Call was declined" message
  
  Timeout path (60s):
    → Backend auto-sets status to "missed"
    → WS event to patient: { type: "call_missed" }
    → Notification created for dentist: "Missed call from John Doe"
```

---

### PHASE 5: Video UI Consistency & Quality (Days 7–8)
*Make video page match the rest of the app*

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 5.1 | Override LiveKit CSS variables to match Teledent design tokens | New: `Frontend/app/globals.css` (LiveKit overrides section) | 2 hr |
| 5.2 | Add page header with appointment info (dentist name, patient name, duration) | `Frontend/app/patient/video/page.tsx` + dentist variant | 1 hr |
| 5.3 | Add call duration timer display in control bar area | `Frontend/components/views/VideoRoom.tsx` | 45 min |
| 5.4 | Add connection quality indicator (using LiveKit's `connectionQuality` event) | `Frontend/components/views/VideoRoom.tsx` | 1 hr |
| 5.5 | Enable screen share for both roles (not just dentist) | `Frontend/components/views/VideoRoom.tsx` | 10 min |
| 5.6 | Add participant name labels on video tiles | `Frontend/components/views/VideoRoom.tsx` | 30 min |
| 5.7 | Fix PreJoin screen styling to use app card components | `Frontend/components/views/VideoRoom.tsx` | 45 min |
| 5.8 | Wrap video page in standard `AppLayout` with sidebar visible | `Frontend/app/patient/video/page.tsx` + dentist | 30 min |
| 5.9 | **Fix auto-redirect race condition**: clear 8s timeout on unmount and on manual nav | `Frontend/app/patient/video/page.tsx` | 15 min |

**Deliverable:** Video page looks native to the app, has timer, quality indicator, and consistent controls.

---

### PHASE 6: Appointment Flow Hardening (Days 9–10)
*Reminders, no-show detection, and robustness*

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 6.1 | Add appointment reminder system (send notification + email 1 hour and 15 min before) | New: `Backend/app/services/reminder_service.py` + cron/scheduler | 3 hr |
| 6.2 | Add no-show auto-detection (if 15 min past scheduled_at and no video session → mark no_show) | Same scheduler | 1.5 hr |
| 6.3 | Add proper reschedule endpoint (validate new slot, notify other party, audit trail) | `Backend/app/routers/appointments.py` | 2 hr |
| 6.4 | Add token refresh mechanism for long video calls (refresh before 2hr expiry) | `Frontend/components/views/VideoRoom.tsx` | 1.5 hr |
| 6.5 | Add heartbeat/cleanup for abandoned video sessions (LiveKit webhook or periodic check) | `Backend/app/services/video_service.py` | 2 hr |
| 6.6 | Add "Missed Call" notification type and display in UI | Both frontend + backend | 1 hr |
| 6.7 | Rate-limit video session creation (prevent room spam) | `Backend/app/routers/video.py` | 30 min |
| 6.8 | **Debounce booking page** slot fetches — only fetch for selected dentist, add 300ms debounce on date change | `Frontend/app/patient/book/page.tsx` | 45 min |

**Deliverable:** Complete robust appointment lifecycle with reminders, no-show handling, and resilient video sessions.

---

## 📊 Phase Summary

| Phase | Focus | Duration | Dependencies |
|-------|-------|----------|--------------|
| **Phase 1** | Critical bug fixes (imports, duplicate booking, admin router, auth crash) | 1 day | None |
| **Phase 2** | Report sharing system | 2 days | Phase 1 |
| **Phase 3** | Notification & badge fix + messages unread endpoint | 1.5 days | Phase 1 |
| **Phase 4** | Real-time system: incoming calls + live chat via WebSocket | 3 days | Phase 3 |
| **Phase 5** | Video UI consistency + redirect fix | 2 days | Phase 1 (LiveKit working) |
| **Phase 6** | Hardening (reminders, no-show, reschedule, token refresh, booking debounce) | 2 days | Phases 1–4 |

**Total Estimated Effort: 10–12 working days**

---

## 📝 Report Sharing — Detailed UX Flow

### Patient Booking Flow (Updated):
```
1. Patient clicks "Book Appointment"
2. Selects dentist, date/time, duration
3. NEW STEP: "Share Reports" section appears
   - Shows list of patient's reports (scan image thumbnail, diagnosis, date)
   - Each has a checkbox (default: unchecked)
   - Helper text: "Select reports you want to share with your dentist for this consultation"
   - Optional: "Share All" / "Share None" quick actions
4. Patient confirms booking
5. Backend creates appointment + entries in appointment_reports junction table
```

### Dentist View (Updated):
```
1. Dentist opens appointment detail
2. NEW SECTION: "Patient's Shared Reports" card
   - Shows only reports the patient explicitly shared
   - Each report card shows: diagnosis, date, risk level, thumbnail
   - Click → opens full report view (findings, AI explanation, images, PDF download)
   - If no reports shared: "The patient has not shared any reports for this consultation"
3. During video call: dentist can reference shared reports from notes panel
```

### Post-Booking Report Management:
```
1. Patient goes to Appointments → clicks specific appointment
2. Sees "Shared Reports" section with currently shared reports
3. Can add more: "+ Share Report" button opens modal with unshared reports
4. Can remove: "×" button on each shared report (with confirmation)
5. Changes reflect immediately for the dentist
```

---

*End of audit report.*

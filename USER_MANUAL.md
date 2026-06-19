# Teledent AI — End-to-End User Manual

## 1) What this platform does
Teledent AI is a full tele-dentistry system with:
- AI-based dental image screening
- PDF report generation
- Patient ↔ Dentist appointment booking
- Stripe payment checkout
- Real-time chat + video consultation (LiveKit)
- Admin operations (users, dentists, analytics, platform settings)

Roles:
- **Patient**
- **Dentist**
- **Admin**

---

## 2) Quick Start (Local Setup)

### 2.1 Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL
- Redis (recommended for full runtime features)
- Cloudinary account
- LiveKit account/server
- Stripe test keys
- Google OAuth client (optional)

### 2.2 Backend setup
From project root:
1. Go to backend folder:
   - `cd Backend`
2. Create virtual environment and install dependencies:
   - `python -m venv .venv`
   - `source .venv/bin/activate`
   - `pip install -r requirements.txt`
3. Configure `Backend/.env` (see section 3).
4. Start API server:
   - `python run.py`

Backend runs on `http://localhost:8000`.
API docs:
- `http://localhost:8000/docs`
- `http://localhost:8000/redoc`

### 2.3 Frontend setup
In a new terminal:
1. `cd Frontend`
2. `npm install`
3. Create `Frontend/.env.local` and set:
   - `NEXT_PUBLIC_API_URL=http://localhost:8000`
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID=<your_google_client_id>` (optional)
4. Run:
   - `npm run dev`

Frontend runs on `http://localhost:3000`.

### 2.4 Optional: seed admin account
From `Backend/`:
- `python seed_admin.py`

This creates a default admin account (for development).

---

## 3) Environment Variables

### Backend (`Backend/.env`)
Required core keys:
- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `FRONTEND_URL`

Feature keys:
- Cloudinary: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- LiveKit: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- Email: `RESEND_API_KEY`, `EMAIL_FROM`
- Google OAuth: `GOOGLE_CLIENT_ID`
- AI: `GEMINI_API_KEY`, optional model path overrides
- Redis: `REDIS_URL`

### Frontend (`Frontend/.env.local`)
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (optional)

---

## 4) User Journey by Role

## 4.1 Patient Journey (End-to-End)

### Step 1 — Create account / login
- Open `/signup` and select **Patient** role.
- Or use `/login`.
- Optional: Google sign-in.

### Step 2 — Upload dental scan
- Go to **Patient → Upload Scan** (`/patient/scan`).
- Choose one mode:
  - X-Ray upload
  - Teeth photo upload
  - Live camera teeth scan
- Submit image. AI pipeline starts.

### Step 3 — Wait for AI analysis
- Processing screen polls status automatically.
- When complete, user is redirected to report page.

### Step 4 — View AI report
- Open **Patient → Report** (`/patient/report`).
- Review:
  - Risk level
  - Findings with confidence
  - AI summary/notes
  - Dentist review (if available)
- Download PDF if generated.

### Step 5 — Book appointment
- Go to **Patient → Book** (`/patient/book`).
- Select dentist and date.
- Pick available slot.
- Optionally share past reports with dentist.

### Step 6 — Pay for consultation
- After booking, redirect to `/patient/checkout`.
- Complete Stripe payment.
- On success, user can jump directly to chat.

### Step 7 — Message dentist
- Open **Patient → Messages** (`/patient/messages`).
- Start or continue conversation.
- Send text updates / schedule discussion.

### Step 8 — Join video consultation
- Open **Patient → Appointments** and click **Join Call**
  or join from Messages where available.
- Pre-join: camera/mic check.
- Connect to LiveKit room.
- On end, session closes and user returns to appointments.

### Step 9 — Manage account
- View upcoming/past appointments.
- Access scans and reports history.
- Update profile/settings.

---

## 4.2 Dentist Journey (End-to-End)

### Step 1 — Register / login
- Sign up as **Dentist** or be invited by admin.
- Login routes to `/dentist/dashboard`.
- If not approved, dentist sees pending approval state.

### Step 2 — Set availability
- Open **Dentist → Settings**.
- Configure:
  - `available_from`
  - `available_until`
  - working days

### Step 3 — Review appointment requests
- Open **Dentist → Appointments**.
- Tabs: pending / confirmed / completed.
- Actions:
  - Confirm (accept)
  - Reject with reason
  - Mark complete
  - Open shared patient reports

### Step 4 — Chat with patients
- Open **Dentist → Messages**.
- Start conversations with booked patients.
- Send follow-ups or scheduling messages.

### Step 5 — Start video consultation
- From appointment or messages, click **Start/Join Call**.
- Backend creates/reuses session.
- Patient receives incoming call notification.

### Step 6 — Review AI cases and finalize diagnosis
- Open **Dentist → Cases**.
- Filter pending/reviewed scans.
- For each case:
  - Inspect findings
  - Add final diagnosis
  - Add clinical notes
  - Save review
  - Download generated PDF (if available)

### Step 7 — Profile/settings maintenance
- Update profile details.
- Adjust availability schedule as needed.

---

## 4.3 Admin Journey (End-to-End)

### Step 1 — Login
- Admin login redirects to `/admin/dashboard`.

### Step 2 — Monitor platform status
- Dashboard cards include totals for:
  - patients
  - dentists
  - scans
  - video sessions

### Step 3 — Manage dentists
- Open `/admin/dentists`.
- Actions:
  - Invite dentist (creates temp credentials)
  - Approve pending dentists
  - Suspend/reactivate dentists

### Step 4 — Manage patients
- Open `/admin/patients`.
- Search/filter and review patient records.

### Step 5 — View analytics
- Open `/admin/analytics`.
- Review monthly scan trends and key counters.

### Step 6 — Configure platform settings
- Open `/admin/settings`.
- Manage:
  - platform config (name, timezone, maintenance mode)
  - notifications
  - security policies
  - AI configuration

---

## 5) Real-Time Notifications & Incoming Calls

- Frontend maintains WebSocket connection to `/ws/notifications`.
- Incoming call modal appears globally when `incoming_call` event arrives.
- User can:
  - **Accept** → navigates to video page
  - **Decline** → backend marks declined and notifies caller
- Fallback polling of notifications is used if socket temporarily disconnects.

---

## 6) Data/Feature Flow Overview

1. **Upload**: patient gets Cloudinary signature → direct upload → backend stores scan.
2. **AI**: background analysis runs (Keras + explanation service) → analysis record updates.
3. **Report**: auto report generated, optionally dentist-reviewed.
4. **Appointment**: patient books slot with dentist.
5. **Payment**: Stripe intent created + confirmed.
6. **Communication**: messages + notifications.
7. **Consultation**: video session token issued, call started/ended tracked.

---

## 7) Operating Checks (Daily)

Recommended daily checks for operators:
- API health: `/health`
- Frontend loads and can call backend (`NEXT_PUBLIC_API_URL` correct)
- Cloudinary signed upload works
- AI processing queue completes scans
- Stripe test payment succeeds
- LiveKit token issue + 2-party room connection works
- WebSocket notifications received

---

## 8) Troubleshooting Guide

### Login fails / session expires quickly
- Verify JWT secret and token expiry settings.
- Ensure frontend stores and refreshes access/refresh tokens.

### Scan upload fails
- Check Cloudinary credentials and allowed upload settings.
- Ensure frontend file type is supported.

### AI report never completes
- Verify model files exist in Backend root:
  - `vgg16_final_best.keras`
  - `best_xray_3class.keras`
- Check AI-related keys and service logs.

### Payment cannot initialize
- Check Stripe keys in backend env.
- Verify publishable key is returned in payment intent response.

### Video call cannot connect
- Verify LiveKit URL and API key/secret match.
- Confirm both users are joining the same appointment/session.
- Check browser camera/mic permissions.

### Incoming call pop-up not showing
- Ensure WebSocket endpoint is reachable from browser.
- Confirm user has valid JWT and socket is connected.
- Verify notifications fallback polling still returns unread `call.started` items.

---

## 9) Security & Compliance Notes

- Use strong production secrets for JWT and third-party integrations.
- Do not keep default seeded admin credentials in production.
- Restrict CORS to trusted frontend origins.
- Enforce HTTPS/WSS in production.
- Rotate API keys regularly.

---

## 10) Docker Notes

Root Dockerfile builds backend service with required system libraries.
Typical run pattern:
1. Build image.
2. Provide env file with backend configuration.
3. Expose API port.
4. Run frontend separately (or deploy independently).

---

## 11) Suggested Go-Live Checklist

- [ ] Production DB configured and migrated
- [ ] Admin user created securely
- [ ] Cloudinary tested (upload + delete)
- [ ] Stripe test + live keys validated
- [ ] LiveKit tested with real external network
- [ ] Email notifications tested
- [ ] End-to-end test pass for all 3 roles
- [ ] Monitoring + logging enabled

---

## 12) Support / Maintenance Entry Points

- Backend API docs: `/docs`
- Core backend entry: `Backend/run.py`
- Frontend API client: `Frontend/lib/api.ts`
- Realtime socket client: `Frontend/lib/websocket-context.tsx`


If you want, this manual can be split into separate operational guides:
1) End User Guide (Patients + Dentists),
2) Admin Operations Handbook,
3) Deployment/DevOps Runbook.
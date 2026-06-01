/**
 * lib/api.ts — Central API client.
 * All requests go through /api (proxied to FastAPI by next.config.ts).
 * Automatically attaches the access token and handles 401 refresh.
 */

const BASE = "/api";

// ---------------------------------------------------------------------------
// Token helpers (localStorage — switch to httpOnly cookies for production)
// ---------------------------------------------------------------------------
export const tokenStore = {
  getAccess: () => (typeof window !== "undefined" ? localStorage.getItem("access_token") : null),
  getRefresh: () => (typeof window !== "undefined" ? localStorage.getItem("refresh_token") : null),
  set: (access: string, refresh: string) => {
    localStorage.setItem("access_token", access);
    localStorage.setItem("refresh_token", refresh);
  },
  clear: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("teledent_user");
  },
};

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------
type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  isRetry = false
): Promise<T> {
  const token = tokenStore.getAccess();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Auto-refresh on 401
  if (res.status === 401 && !isRetry) {
    const refreshToken = tokenStore.getRefresh();
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          tokenStore.set(data.access_token, data.refresh_token);
          return request<T>(method, path, body, true);
        }
      } catch {}
    }
    tokenStore.clear();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    let message: string = err.detail || err.title || "Request failed";
    // Strip Pydantic field prefixes like "body.email: Value error, "
    message = message.replace(/^body\.\w+:\s*(Value error,\s*)?/i, "");
    if (res.status === 422) message = message || "Invalid input. Please check your details.";
    throw new ApiError(res.status, message, err);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Typed API namespaces
// ---------------------------------------------------------------------------

export const authApi = {
  login: (email: string, password: string) =>
    request<{ access_token: string; refresh_token: string; expires_in: number; user: User }>(
      "POST", "/auth/login", { email, password }
    ),
  register: (data: RegisterPayload) =>
    request<{ user_id: string; access_token: string; refresh_token: string }>(
      "POST", "/auth/register", data
    ),
  googleLogin: (id_token: string, role?: string) =>
    request<{ access_token: string; refresh_token: string; user: User }>(
      "POST", "/auth/google", { id_token, role }
    ),
  logout: (refresh_token: string) =>
    request<void>("POST", "/auth/logout", { refresh_token }),
  me: () => request<User>("GET", "/auth/me"),
  updateMe: (data: Partial<User>) => request<User>("PATCH", "/auth/me", data),
  forgotPassword: (email: string) =>
    request<{ message: string }>("POST", "/auth/forgot-password", { email }),
  resetPassword: (token: string, new_password: string) =>
    request<{ message: string }>("POST", "/auth/reset-password", { token, new_password }),
};

export const patientApi = {
  list: (params?: { page?: number; limit?: number; search?: string; status?: string }) =>
    request<PaginatedResponse<PatientSummary>>("GET", `/patients?${new URLSearchParams(params as Record<string, string>)}`),
  get: (id: string) => request<Patient>("GET", `/patients/${id}`),
  update: (id: string, data: Partial<Patient>) => request<Patient>("PATCH", `/patients/${id}`, data),
  delete: (id: string) => request<void>("DELETE", `/patients/${id}`),
  scans: (id: string, page = 1) => request<PaginatedResponse<Scan>>("GET", `/patients/${id}/scans?page=${page}`),
  appointments: (id: string, page = 1) => request<PaginatedResponse<Appointment>>("GET", `/patients/${id}/appointments?page=${page}`),
  reports: (id: string, page = 1) => request<PaginatedResponse<Report>>("GET", `/patients/${id}/reports?page=${page}`),
};

export const scanApi = {
  create: (data: CreateScanPayload) => request<{ scan_id: string; status: string; estimated_processing_sec: number }>("POST", "/scans", data),
  list: (page = 1, limit = 20) => request<PaginatedResponse<Scan>>("GET", `/scans?page=${page}&limit=${limit}`),
  get: (id: string) => request<Scan>("GET", `/scans/${id}`),
  delete: (id: string) => request<void>("DELETE", `/scans/${id}`),
  reanalyze: (id: string) => request<{ scan_id: string; status: string }>("POST", `/scans/${id}/reanalyze`),
  analysis: (id: string) => request<Analysis>("GET", `/scans/${id}/analysis`),
  analysisStatus: (id: string) => request<{ scan_id: string; status: string }>("GET", `/scans/${id}/analysis/status`),
};

export const reportApi = {
  list: (page = 1, scan_id?: string) => {
    const params = new URLSearchParams({ page: String(page) });
    if (scan_id) params.set("scan_id", scan_id);
    return request<PaginatedResponse<Report>>("GET", `/reports?${params}`);
  },
  get: (id: string) => request<Report>("GET", `/reports/${id}`),
  create: (data: CreateReportPayload) => request<{ report_id: string; created_at: string; pdf_url: string }>("POST", "/reports", data),
  update: (id: string, data: Partial<CreateReportPayload>) => request<Report>("PATCH", `/reports/${id}`, data),
  pdfUrl: (id: string) => `${BASE}/reports/${id}/pdf`,
};

export const appointmentApi = {
  create: (data: CreateAppointmentPayload) => request<{ appointment_id: string; join_url: string; status: string }>("POST", "/appointments", data),
  list: (page = 1) => request<PaginatedResponse<Appointment>>("GET", `/appointments?page=${page}`),
  get: (id: string) => request<Appointment>("GET", `/appointments/${id}`),
  update: (id: string, data: Partial<Appointment>) => request<Appointment>("PATCH", `/appointments/${id}`, data),
  cancel: (id: string) => request<void>("DELETE", `/appointments/${id}`),
  complete: (id: string) => request<{ message: string }>("POST", `/appointments/${id}/complete`),
};

export const videoApi = {
  createSession: (appointment_id: string) => request<{ session_id: string; room_name: string }>("POST", "/video/sessions", { appointment_id }),
  getToken: (session_id: string) => request<{ token: string; room_name: string; livekit_url: string; expires_at: string }>("POST", `/video/sessions/${session_id}/token`),
  endSession: (session_id: string) => request<{ message: string }>("POST", `/video/sessions/${session_id}/end`),
};

export const dentistApi = {
  list: (params?: { page?: number; limit?: number; search?: string; specialty?: string }) =>
    request<PaginatedResponse<DentistSummary>>("GET", `/dentists?${new URLSearchParams((params || {}) as Record<string, string>)}`),
  get: (id: string) => request<DentistProfile>("GET", `/dentists/${id}`),
  availableSlots: (id: string, date: string) =>
    request<{ slots: string[] }>("GET", `/dentists/${id}/slots?date=${date}`),
};

export const adminApi = {
  stats: () => request<AdminStats>("GET", "/admin/stats"),

  // Dentist management
  listDentists: (params?: { page?: number; limit?: number; search?: string; specialty?: string }) =>
    request<PaginatedResponse<AdminDentist>>("GET", `/admin/dentists?${new URLSearchParams((params || {}) as Record<string, string>)}`),
  approveDentist: (id: string) => request<{ message: string }>("POST", `/admin/dentists/${id}/approve`),
  suspendDentist: (id: string) => request<{ message: string }>("POST", `/admin/dentists/${id}/suspend`),
  reactivateDentist: (id: string) => request<{ message: string }>("POST", `/admin/dentists/${id}/reactivate`),
  inviteDentist: (data: InviteDentistPayload) => request<{ message: string; temp_password: string; dentist_id: string }>("POST", "/admin/invite-dentist", data),

  // Patient management
  listPatients: (params?: { page?: number; limit?: number; search?: string }) =>
    request<PaginatedResponse<PatientSummary>>("GET", `/patients?${new URLSearchParams((params || {}) as Record<string, string>)}`),

  // Platform settings
  getSettings: () => request<PlatformSettings>("GET", "/admin/settings"),
  updateSettings: (data: Partial<PlatformSettings>) => request<PlatformSettings>("PATCH", "/admin/settings", data),
};

export const messagesApi = {
  listConversations: () =>
    request<ConversationOut[]>("GET", "/messages"),
  listMessages: (conversationId: string) =>
    request<MessageOut[]>("GET", `/messages/${conversationId}/messages`),
  sendMessage: (conversationId: string, text: string) =>
    request<MessageOut>("POST", `/messages/${conversationId}/messages`, { text }),
  startConversation: (otherUserId: string) =>
    request<ConversationOut>("POST", "/messages", { other_user_id: otherUserId }),
  unreadCount: (conversationId: string) =>
    request<{ conversation_id: string; unread: number }>("GET", `/messages/${conversationId}/unread-count`),
};

export const filesApi = {
  signUpload: (filename: string, mime_type: string, folder = "scans") =>
    request<SignedUploadResponse>("POST", "/files/sign-upload", { filename, mime_type, folder }),
  delete: (public_id: string) => request<void>("DELETE", `/files/${public_id}`),
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "patient" | "dentist" | "admin";
  is_active: boolean;
}

export interface RegisterPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: string;
}

export interface Patient {
  id: string;
  user_id: string;
  phone?: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
}

export interface PatientSummary {
  id: string;
  full_name: string;
  email: string;
  status: string;
  scan_count: number;
}

export interface Scan {
  id: string;
  patient_id: string;
  scan_type: string;
  scan_date: string;
  status: string;
  cloudinary_url: string;
  notes?: string;
  dentist_reviewed: boolean;
  ai_result?: {
    confidence: number;
    findings_count: number;
    top_condition: string;
    overall_risk: string;
    annotated_image_url?: string | null;
  };
  created_at: string;
}

export interface CreateScanPayload {
  cloudinary_public_id: string;
  cloudinary_url: string;
  scan_type: string;
  scan_date: string;
  notes?: string;
}

export interface Analysis {
  scan_id: string;
  status: string;
  confidence_score: number;
  findings: Finding[];
  ai_explanation?: AiExplanation;
  processed_at: string;
  model_version: string;
  report_id?: string | null;
}

export interface AiExplanation {
  patient_summary: string;
  clinical_notes: string;
  overall_risk: "none" | "low" | "moderate" | "high";
  urgency: "monitor" | "schedule_soon" | "see_dentist_this_week" | "urgent";
  image_quality: string;
  annotated_image_url?: string | null;
}

export interface Finding {
  condition: string;
  confidence: number;
  severity: "low" | "moderate" | "high";
  bounding_box: { x1: number; y1: number; x2: number; y2: number; norm_x: number; norm_y: number; norm_w: number; norm_h: number };
  gemini_explanation: string;
  recommendation: string;
}

export interface Report {
  id: string;
  scan_id: string;
  patient_id: string;
  dentist_id?: string | null;
  is_auto_generated: boolean;
  dentist_notes?: string;
  final_diagnosis: string;
  recommended_actions: string[];
  follow_up_date?: string;
  pdf_url?: string;
  created_at: string;
}

export interface CreateReportPayload {
  scan_id: string;
  patient_id: string;
  dentist_notes?: string;
  final_diagnosis: string;
  recommended_actions?: string[];
  follow_up_date?: string;
}

export interface Appointment {
  id: string;
  patient_id: string;
  dentist_id: string;
  scan_id?: string;
  scheduled_at: string;
  duration_min: number;
  type: string;
  status: string;
  join_url?: string;
  created_at: string;
}

export interface CreateAppointmentPayload {
  dentist_id: string;
  scheduled_at: string;
  duration_min?: number;
  type: string;
  scan_id?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface SignedUploadResponse {
  cloudinary_url: string;
  api_key: string;
  timestamp: number;
  signature: string;
  folder: string;
  public_id: string;
}

export interface DentistSummary {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  specialty?: string;
  rating?: number;
  available_today?: boolean;
  next_available?: string;
}

export interface AdminDentist extends DentistSummary {
  is_approved: boolean;
  /** Derived on the frontend from is_approved + user.is_active */
  status?: "Active" | "Pending" | "Suspended";
}

export interface InviteDentistPayload {
  email: string;
  first_name: string;
  last_name: string;
  specialty?: string;
}

export interface PlatformSettings {
  platform: {
    platform_name: string;
    support_email: string;
    timezone: string;
    default_language: string;
    maintenance_mode: boolean;
  };
  notifications: {
    email_on_new_patient: boolean;
    email_on_dentist_request: boolean;
    email_on_scan_complete: boolean;
    sms_alerts: boolean;
  };
  security: {
    require_email_verification: boolean;
    session_timeout_minutes: number;
    max_login_attempts: number;
    two_factor_required: boolean;
  };
  ai: {
    auto_analyze_scans: boolean;
    confidence_threshold: number;
    model_version: string;
  };
}

export interface DentistProfile extends DentistSummary {
  bio?: string;
  license_number?: string;
  years_experience?: number;
}

export interface AdminStats {
  total_patients: number;
  total_dentists: number;
  total_scans: number;
  total_reports: number;
  total_appointments: number;
  total_video_sessions: number;
  new_patients_this_week: number;
  scans_this_month: number;
}

export interface ConversationOut {
  id: string;
  patient_id: string;
  dentist_id: string;
  created_at: string;
}

export interface MessageOut {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string;
  is_read: boolean;
  sent_at: string;
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------
export interface PaymentIntent {
  payment_id: string;
  appointment_id: string;
  status: "pending" | "succeeded" | "failed" | "not_created";
  amount_cents: number;
  currency: string;
  client_secret: string | null;
  publishable_key: string;
}

export const paymentApi = {
  createIntent: (appointment_id: string) =>
    request<PaymentIntent>("POST", "/payments/create-intent", { appointment_id }),

  getStatus: (appointment_id: string) =>
    request<PaymentIntent>("GET", `/payments/status/${appointment_id}`),
};

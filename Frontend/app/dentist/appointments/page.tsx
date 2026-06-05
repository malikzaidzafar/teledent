"use client";
import { useState } from "react";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader, Badge, Avatar, SectionCard } from "@/components/ui/shared";
import { useRequireAuth } from "@/lib/auth";
import { useAppointments } from "@/lib/hooks/useAppointments";
import { appointmentApi, messagesApi, reportApi, type SharedReport } from "@/lib/api";
import { useRouter } from "next/navigation";

type Tab = "pending" | "confirmed" | "completed" | "all";

const STATUS_VARIANT: Record<string, "success" | "warning" | "blue" | "danger"> = {
  confirmed: "success",
  pending: "warning",
  completed: "blue",
  cancelled: "danger",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export default function DentistAppointmentsPage() {
  const { loading: authLoading } = useRequireAuth("dentist");
  const { data, loading, error, refetch } = useAppointments();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("pending");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [messaging, setMessaging] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [viewingReports, setViewingReports] = useState<string | null>(null);
  const [reportsByAppt, setReportsByAppt] = useState<Record<string, SharedReport[]>>({});
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; patientName: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  if (authLoading) return null;

  const all = data?.data || [];
  const pending   = all.filter(a => a.status === "pending");
  const confirmed = all.filter(a => a.status === "confirmed");
  const completed = all.filter(a => a.status === "completed");

  const displayed = tab === "pending"   ? pending
                  : tab === "confirmed" ? confirmed
                  : tab === "completed" ? completed
                  : all;

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "pending",   label: "Pending",   count: pending.length },
    { key: "confirmed", label: "Confirmed", count: confirmed.length },
    { key: "completed", label: "Completed", count: completed.length },
    { key: "all",       label: "All",       count: all.length },
  ];

  async function handleConfirm(id: string) {
    setConfirming(id);
    setActionError(null);
    try {
      await appointmentApi.accept(id);
      refetch();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Failed to confirm appointment.");
    } finally {
      setConfirming(null);
    }
  }

  async function handleComplete(id: string) {
    setCompleting(id);
    setActionError(null);
    try {
      await appointmentApi.complete(id);
      refetch();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Failed to mark as complete.");
    } finally {
      setCompleting(null);
    }
  }

  async function handleReject() {
    if (!rejectModal || !rejectReason.trim()) return;
    setRejecting(true);
    setActionError(null);
    try {
      await appointmentApi.reject(rejectModal.id, rejectReason.trim());
      setRejectModal(null);
      setRejectReason("");
      refetch();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Failed to reject appointment.");
    } finally {
      setRejecting(false);
    }
  }

  // WP3D FIX: use patient_user_id (User UUID), NOT patient_id (Patient UUID)
  async function handleMessage(patientUserId: string | undefined, apptId: string) {
    if (!patientUserId) return;
    setMessaging(apptId);
    try {
      const conv = await messagesApi.startConversation(patientUserId);
      router.push(`/dentist/messages?conv=${conv.id}`);
    } catch {
      setMessaging(null);
    }
  }

  async function toggleReports(apptId: string) {
    if (viewingReports === apptId) { setViewingReports(null); return; }
    setViewingReports(apptId);
    if (!reportsByAppt[apptId]) {
      try {
        const reports = await appointmentApi.getSharedReports(apptId);
        setReportsByAppt(prev => ({ ...prev, [apptId]: reports }));
      } catch {
        setReportsByAppt(prev => ({ ...prev, [apptId]: [] }));
      }
    }
  }

  return (
    <AppLayout role="dentist" pageTitle="Appointments">
      <PageHeader
        title="Appointments"
        subtitle="Review incoming requests and manage your schedule."
        action={
          pending.length > 0 ? (
            <span style={{
              background: "#fef3c7", color: "#b45309", border: "1px solid #fcd34d",
              borderRadius: 999, padding: "5px 14px", fontSize: 13, fontWeight: 700,
            }}>
              {pending.length} pending confirmation{pending.length > 1 ? "s" : ""}
            </span>
          ) : undefined
        }
      />

      <div className="page-body">
        {/* Error banner */}
        {actionError && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: 18, color: "#dc2626", fontSize: 13 }}>
            {actionError}
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0, marginBottom: 22, background: "var(--surface-2)", borderRadius: "var(--radius)", border: "1px solid var(--border)", overflow: "hidden", width: "fit-content" }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "8px 20px", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
                background: tab === t.key ? "var(--brand-blue)" : "transparent",
                color: tab === t.key ? "#fff" : "var(--text-secondary)",
                transition: "all 0.15s",
                borderRight: "1px solid var(--border)",
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span style={{
                  marginLeft: 6, background: tab === t.key ? "rgba(255,255,255,0.25)" : "var(--brand-blue-light)",
                  color: tab === t.key ? "#fff" : "var(--brand-blue)",
                  borderRadius: 999, padding: "1px 7px", fontSize: 11, fontWeight: 800,
                }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)" }}>Loading appointments…</div>
        ) : error ? (
          <div style={{ padding: 20, color: "#dc2626", background: "#fef2f2", borderRadius: "var(--radius)" }}>{error}</div>
        ) : displayed.length === 0 ? (
          <SectionCard title="">
            <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, color: "var(--text-secondary)" }}>
                {tab === "pending" ? "No pending requests" : tab === "confirmed" ? "No confirmed appointments" : tab === "completed" ? "No completed appointments yet" : "No appointments found"}
              </div>
              <div style={{ fontSize: 13 }}>
                {tab === "pending" ? "All appointment requests have been handled." : "They will appear here when available."}
              </div>
            </div>
          </SectionCard>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {displayed.map((a) => {
              const isPending   = a.status === "pending";
              const isConfirmed = a.status === "confirmed";
              const patientDisplayName = a.patient_name || `Patient #${a.patient_id.slice(0, 8).toUpperCase()}`;
              const hasReports = (a.shared_reports_count ?? 0) > 0;

              return (
                <div key={a.id}>
                  <div
                    style={{
                      background: "var(--surface)",
                      border: isPending
                        ? "1px solid #fcd34d"
                        : isConfirmed
                          ? "1px solid #86efac"
                          : "1px solid var(--border)",
                      borderRadius: viewingReports === a.id ? "var(--radius-xl) var(--radius-xl) 0 0" : "var(--radius-xl)",
                      padding: "18px 22px",
                      display: "flex",
                      alignItems: "center",
                      gap: 18,
                      flexWrap: "wrap",
                      boxShadow: isPending ? "0 2px 12px rgba(251,191,36,0.12)" : "var(--shadow-sm)",
                      transition: "box-shadow 0.2s",
                    }}
                  >
                    {/* Status indicator stripe */}
                    <div style={{
                      width: 4, height: 52, borderRadius: 2, flexShrink: 0,
                      background: isPending ? "#f59e0b" : isConfirmed ? "#16a34a" : a.status === "completed" ? "var(--brand-blue)" : "#94a3b8",
                    }} />

                    {/* Avatar + patient info */}
                    <div style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, minWidth: 180 }}>
                      <Avatar name={patientDisplayName} size={42} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{patientDisplayName}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{a.type.replace(/_/g, " ")}</div>
                      </div>
                    </div>

                    {/* Date / Time */}
                    <div style={{ minWidth: 140 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{fmtDate(a.scheduled_at)}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{fmtTime(a.scheduled_at)} · {a.duration_min} min</div>
                    </div>

                    {/* Badge */}
                    <Badge variant={STATUS_VARIANT[a.status] ?? "blue"}>{a.status}</Badge>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
                      {isPending && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleConfirm(a.id)} disabled={confirming === a.id} style={{ minWidth: 90 }}>
                          {confirming === a.id ? "Confirming…" : "Confirm"}
                        </button>
                      )}
                      {isPending && (
                        <button className="btn btn-sm" style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", fontWeight: 700 }} onClick={() => { setRejectModal({ id: a.id, patientName: patientDisplayName }); setRejectReason(""); }}>
                          Reject
                        </button>
                      )}
                      {isConfirmed && (
                        <button className="btn btn-sm" style={{ background: "#dcfce7", color: "#15803d", border: "none", fontWeight: 700 }} onClick={() => handleComplete(a.id)} disabled={completing === a.id}>
                          {completing === a.id ? "Saving…" : "Mark Complete"}
                        </button>
                      )}
                      {isConfirmed && (
                        <a href={`/dentist/video?appointment_id=${a.id}`} className="btn btn-primary btn-sm">Start Call</a>
                      )}
                      {(isPending || isConfirmed || a.status === "completed") && (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleMessage(a.patient_user_id, a.id)} disabled={messaging === a.id} title="Message this patient">
                          {messaging === a.id ? "…" : "Message"}
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => toggleReports(a.id)}
                        title="View reports shared by patient"
                        style={{ color: hasReports ? "var(--brand-blue)" : "var(--text-muted)", fontWeight: hasReports ? 700 : 400 }}
                      >
                        {viewingReports === a.id ? "Hide Reports" : `📊 Reports${hasReports ? ` (${a.shared_reports_count})` : ""}`}
                      </button>
                    </div>
                  </div>

                  {/* Shared Reports Panel */}
                  {viewingReports === a.id && (
                    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 var(--radius-xl) var(--radius-xl)", padding: "16px 22px" }}>
                      {!reportsByAppt[a.id] ? (
                        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>
                      ) : reportsByAppt[a.id].length === 0 ? (
                        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No reports shared for this appointment.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Patient-Shared Reports</div>
                          {reportsByAppt[a.id].map((r) => (
                            <div key={r.report_id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{r.final_diagnosis || "AI Analysis Report"}</div>
                                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                                  Shared {r.shared_at ? new Date(r.shared_at).toLocaleDateString() : "—"}
                                  {r.is_auto_generated ? " · AI Generated" : " · Dentist Review"}
                                </div>
                              </div>
                              <button
                                className="btn btn-primary btn-sm"
                                style={{ flexShrink: 0 }}
                                disabled={downloadingPdf === r.report_id}
                                onClick={async () => {
                                  setDownloadingPdf(r.report_id);
                                  try {
                                    const url = await reportApi.downloadPdf(r.report_id);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = `teledent-report-${r.report_id.slice(0, 8)}.pdf`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    setTimeout(() => URL.revokeObjectURL(url), 10000);
                                  } catch {
                                    // silently fail
                                  } finally {
                                    setDownloadingPdf(null);
                                  }
                                }}
                              >
                                {downloadingPdf === r.report_id ? "Loading…" : "View PDF"}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* B5: Reject appointment modal */}
      {rejectModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "var(--surface)", borderRadius: "var(--radius-xl)", padding: 28, width: "100%", maxWidth: 440, boxShadow: "var(--shadow-lg)" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 800 }}>Reject Appointment</h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
              Please provide a reason for rejecting <strong>{rejectModal.patientName}</strong>&apos;s appointment.
              They will be notified by email.
            </p>
            <textarea
              className="input"
              rows={4}
              placeholder="Enter rejection reason…"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              style={{ resize: "vertical", marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setRejectModal(null)} disabled={rejecting}>Cancel</button>
              <button
                className="btn btn-danger"
                onClick={handleReject}
                disabled={rejecting || !rejectReason.trim()}
              >
                {rejecting ? "Rejecting…" : "Reject Appointment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

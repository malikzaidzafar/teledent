"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader, Badge, Avatar, SectionCard } from "@/components/ui/shared";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth";
import { useAppointments } from "@/lib/hooks/useAppointments";
import { appointmentApi, messagesApi } from "@/lib/api";
import { useState } from "react";
import { useRouter } from "next/navigation";

const sv = (s: string) =>
  s === "confirmed" ? "success" : s === "pending" ? "warning" : s === "completed" ? "blue" : "danger";

export default function AppointmentsPage() {
  const { loading: authLoading } = useRequireAuth("patient");
  const { data, loading, error, refetch } = useAppointments();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [messaging, setMessaging] = useState<string | null>(null);
  const router = useRouter();

  if (authLoading) return null;

  const appointments = data?.data || [];
  const nextAppt = appointments.find(a => a.status === "confirmed" || a.status === "pending");

  async function handleCancel(id: string) {
    setCancelling(id);
    try {
      await appointmentApi.cancel(id);
      refetch();
    } finally {
      setCancelling(null);
    }
  }

  // WP3B FIX: use dentist_user_id (User table UUID), NOT dentist_id (Dentist table UUID)
  async function handleMessage(dentistUserId: string | undefined, apptId: string) {
    if (!dentistUserId) return;
    setMessaging(apptId);
    try {
      const conv = await messagesApi.startConversation(dentistUserId);
      router.push(`/patient/messages?conv=${conv.id}`);
    } catch {
      setMessaging(null);
    }
  }

  return (
    <AppLayout role="patient" pageTitle="Appointments">
      <PageHeader title="My Appointments" subtitle="Your scheduled and past dental consultations."
        action={<Link href="/patient/book" className="btn btn-primary btn-sm">+ Book Appointment</Link>} />
      <div className="page-body">
        {nextAppt && (
          <div style={{ background: "linear-gradient(135deg,var(--brand-blue-light),#dbeafe)", borderRadius: "var(--radius-xl)", padding: "20px 24px", marginBottom: 24, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--brand-blue)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Next Appointment</div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{new Date(nextAppt.scheduled_at).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {nextAppt.dentist_name || "Your dentist"} · {nextAppt.type} · {nextAppt.duration_min} min Video Call
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {nextAppt.status === "confirmed" && (
                <Link
                  href={`/patient/video?appointment_id=${nextAppt.id}`}
                  className="btn btn-primary btn-sm"
                >
                  Join Call
                </Link>
              )}
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleMessage(nextAppt.dentist_user_id, nextAppt.id)}
                disabled={messaging === nextAppt.id}
              >
                {messaging === nextAppt.id ? "Opening…" : "Message Dentist"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading appointments…</div>
        ) : error ? (
          <div style={{ padding: 20, color: "#dc2626", background: "#fef2f2", borderRadius: "var(--radius)" }}>{error}</div>
        ) : (
          <SectionCard title="All Appointments">
            {appointments.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                No appointments yet. <Link href="/patient/book" style={{ color: "var(--brand-blue)" }}>Book one now</Link>.
              </div>
            ) : (
              <div className="table-scroll-wrapper">
                <table className="data-table">
                  <thead>
                    <tr><th>Appointment</th><th>Date &amp; Time</th><th className="col-hide-sm">Duration</th><th>Status</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {appointments.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Avatar name={a.dentist_name || "Dr."} size={32} />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{a.dentist_name || "Your Dentist"}</div>
                              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Video Consultation</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{new Date(a.scheduled_at).toLocaleDateString()}</div>
                          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{new Date(a.scheduled_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</div>
                        </td>
                        <td className="col-hide-sm" style={{ fontSize: 13, color: "var(--text-secondary)" }}>{a.duration_min} min</td>
                        <td><Badge variant={sv(a.status) as "success" | "warning" | "blue" | "danger"}>{a.status}</Badge></td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {a.status === "confirmed" && (
                              <Link
                                href={`/patient/video?appointment_id=${a.id}`}
                                className="btn btn-primary btn-sm"
                              >
                                Join Call
                              </Link>
                            )}
                            {/* WP4A: NO "Join Call" here — video call is only in Messages tab */}
                            {(a.status === "pending" || a.status === "confirmed" || a.status === "completed") && (
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => handleMessage(a.dentist_user_id, a.id)}
                                disabled={messaging === a.id}
                                title="Send a message to your dentist"
                              >
                                {messaging === a.id ? "…" : "Message"}
                              </button>
                            )}
                            {(a.status === "pending" || a.status === "confirmed") && (
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
                                onClick={() => handleCancel(a.id)}
                                disabled={cancelling === a.id}
                              >
                                {cancelling === a.id ? "…" : "Cancel"}
                              </button>
                            )}
                            {a.status === "completed" && a.scan_id && <Link href={`/patient/report?scan_id=${a.scan_id}`} className="btn btn-ghost btn-sm">Report</Link>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        )}
      </div>
    </AppLayout>
  );
}

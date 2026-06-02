"use client";
import AppLayout from "@/components/common/AppLayout";
import { StatCard, PageHeader, SectionCard, Badge, Avatar } from "@/components/ui/shared";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth";
import { useAppointments } from "@/lib/hooks/useAppointments";
import { useScans } from "@/lib/hooks/useScans";

const pv = (p: string) => p === "High" ? "danger" : p === "Medium" ? "warning" : "success";

export default function DentistDashboardPage() {
  const { user, loading: authLoading } = useRequireAuth("dentist");
  const { data: apptData, loading: apptLoading } = useAppointments();
  const { data: scansData, loading: scansLoading } = useScans();

  if (authLoading) return null;

  const isApproved = (user as any)?.is_approved;

  const pendingScans = scansData?.data?.filter(s => !s.dentist_reviewed) || [];
  const pending = apptData?.data?.filter(a => a.status === "pending") || [];
  const todayAppts = apptData?.data?.filter(a => {
    const d = new Date(a.scheduled_at);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }) || [];
  const upcomingAppts = apptData?.data?.filter(a => a.status === "confirmed" || a.status === "pending") || [];

  const STATS = [
    { icon: "", iconBg: "#e8f0fd", value: scansLoading ? "…" : String(pendingScans.length), label: "Open Cases", change: "Awaiting review", changePositive: true },
    { icon: "", iconBg: "#fef3c7", value: apptLoading ? "…" : String(todayAppts.length), label: "Today's Appts", change: "Today's schedule", changePositive: true },
    { icon: "", iconBg: "#dcfce7", value: scansLoading ? "…" : String(scansData?.data?.filter(s => s.dentist_reviewed).length ?? 0), label: "Cases Reviewed", changePositive: true, change: "All time" },
    { icon: "", iconBg: "#f3e8ff", value: String(upcomingAppts.length), label: "Upcoming Appts", change: "Scheduled", changePositive: true },
  ];

  return (
    <AppLayout role="dentist" pageTitle="Dashboard">
      <PageHeader
        title="Dentist Dashboard"
        subtitle={`Welcome, Dr. ${user?.last_name ?? ""}. You have ${pendingScans.length} case${pendingScans.length !== 1 ? "s" : ""} to review.`}
        action={<Link href="/dentist/appointments" className="btn btn-ghost btn-sm">Manage Appointments</Link>}
      />
      <div className="page-body">
        {isApproved === false && (
          <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "var(--radius)", padding: "14px 18px", marginBottom: 22, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 22 }}>⏳</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#92400e" }}>Account Pending Approval</div>
              <div style={{ fontSize: 13, color: "#b45309", marginTop: 2 }}>Your account is under review by the admin. You will be able to receive appointments and access all features once approved.</div>
            </div>
          </div>
        )}

        {/* Pending appointments alert */}
        {pending.length > 0 && (
          <Link href="/dentist/appointments" style={{ textDecoration: "none" }}>
            <div style={{
              background: "linear-gradient(135deg, #fffbeb, #fef3c7)",
              border: "1px solid #fcd34d",
              borderRadius: "var(--radius-lg)",
              padding: "16px 22px",
              marginBottom: 22,
              display: "flex",
              alignItems: "center",
              gap: 14,
              cursor: "pointer",
              transition: "box-shadow 0.2s",
              boxShadow: "0 2px 12px rgba(251,191,36,0.15)",
            }}>
              <span style={{ fontSize: 28 }}></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#92400e" }}>
                  {pending.length} Appointment Request{pending.length > 1 ? "s" : ""} Awaiting Confirmation
                </div>
                <div style={{ fontSize: 13, color: "#b45309", marginTop: 2 }}>
                  Click to review and confirm patient appointment bookings.
                </div>
              </div>
              <span style={{ color: "#b45309", fontWeight: 700, fontSize: 18 }}>→</span>
            </div>
          </Link>
        )}
        <div className="grid-4" style={{ marginBottom: 24 }}>
          {STATS.map((s) => <StatCard key={s.label} {...s} />)}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,320px)", gap: 22 }}>
          <SectionCard title="Pending Case Review" action={<Link href="/dentist/cases" style={{ fontSize: 13, color: "var(--brand-blue)", textDecoration: "none", fontWeight: 600 }}>View all</Link>}>
            {scansLoading ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading cases…</div>
            ) : pendingScans.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>All caught up! No pending cases.</div>
            ) : (
              <div className="table-scroll-wrapper">
                <table className="data-table">
                  <thead><tr><th>Scan Type</th><th className="col-hide-sm">AI Finding</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {pendingScans.slice(0, 5).map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 500, fontSize: 13 }}>{s.scan_type}</td>
                        <td className="col-hide-sm" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                          {s.ai_result ? `${s.ai_result.findings_count} finding${s.ai_result.findings_count !== 1 ? "s" : ""}` : "Processing…"}
                        </td>
                        <td><Badge variant="warning">Awaiting Review</Badge></td>
                        <td><Link href={`/patient/report?scan_id=${s.id}`} className="btn btn-primary btn-sm">Review</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Today's Schedule">
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {apptLoading ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>Loading…</div>
              ) : todayAppts.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 14, padding: "12px 0" }}>No appointments today.</div>
              ) : todayAppts.map((a) => (
                <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--surface-3)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--brand-blue)", width: 70, flexShrink: 0 }}>
                    {new Date(a.scheduled_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{a.type}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{a.duration_min} min</div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </AppLayout>
  );
}

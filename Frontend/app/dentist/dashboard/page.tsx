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

  const pendingScans = scansData?.data?.filter(s => !s.dentist_reviewed) || [];
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
        action={<Link href="/dentist/profile" className="btn btn-ghost btn-sm">My Profile</Link>}
      />
      <div className="page-body">
        <div className="grid-4" style={{ marginBottom: 24 }}>
          {STATS.map((s) => <StatCard key={s.label} {...s} />)}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,320px)", gap: 22 }}>
          <SectionCard title="Pending Case Review" action={<Link href="/dentist/cases" style={{ fontSize: 13, color: "var(--brand-blue)", textDecoration: "none", fontWeight: 600 }}>View all</Link>}>
            {scansLoading ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading cases…</div>
            ) : pendingScans.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>All caught up! No pending cases. </div>
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

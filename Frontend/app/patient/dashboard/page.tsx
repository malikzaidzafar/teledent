"use client";
import AppLayout from "@/components/common/AppLayout";
import { StatCard, PageHeader, SectionCard, Badge, Avatar } from "@/components/ui/shared";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth";
import { useScans } from "@/lib/hooks/useScans";
import { useAppointments } from "@/lib/hooks/useAppointments";

const statusVariant = (s: string) => s === "Complete" ? "success" : s === "In Review" ? "warning" : "gray";

export default function PatientDashboardPage() {
  const { user, loading: authLoading } = useRequireAuth("patient");
  const { data: scansData, loading: scansLoading } = useScans();
  const { data: apptData, loading: apptLoading } = useAppointments();

  if (authLoading) return null;
  const userName = user ? `${user.first_name} ${user.last_name}` : "Patient";
  const recentScans = scansData?.data?.slice(0, 3) || [];
  const upcomingAppt = apptData?.data?.find(a => a.status === "confirmed" || a.status === "pending");

  const STATS = [
    { icon: "", iconBg: "#e8f0fd", value: scansLoading ? "…" : String(scansData?.total ?? 0), label: "Total Scans", change: "your scans", changePositive: true },
    { icon: "", iconBg: "#fef3c7", value: apptLoading ? "…" : String(apptData?.data?.filter(a => a.status === "confirmed" || a.status === "pending").length ?? 0), label: "Upcoming Appts", change: "scheduled", changePositive: true },
    { icon: "", iconBg: "#dcfce7", value: scansLoading ? "…" : String(scansData?.data?.filter(s => s.status === "complete").length ?? 0), label: "Reports Ready", change: "View now", changePositive: true },
    { icon: "", iconBg: "#f3e8ff", value: "0", label: "Active Video Calls", change: "None scheduled", changePositive: false },
  ];

  return (
    <AppLayout role="patient" pageTitle="Dashboard">
      <PageHeader
        title="My Dashboard"
        subtitle={`Welcome back, ${user?.first_name ?? ""}. Here's your dental health summary.`}
        action={<Link href="/patient/scan" className="btn btn-primary btn-sm">+ New Scan</Link>}
      />
      <div className="page-body">
        <div className="grid-4" style={{ marginBottom: 24 }}>
          {STATS.map((s) => <StatCard key={s.label} {...s} />)}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,360px)", gap: 22 }}>
          <SectionCard title="Recent Scans" action={<Link href="/patient/scans" style={{ fontSize: 13, color: "var(--brand-blue)", textDecoration: "none", fontWeight: 600 }}>View all</Link>}>
            {scansLoading ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading scans…</div>
            ) : recentScans.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No scans yet. <Link href="/patient/scan" style={{ color: "var(--brand-blue)" }}>Upload your first scan</Link>.</div>
            ) : (
              <div className="table-scroll-wrapper">
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Type</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {recentScans.map((r) => (
                      <tr key={r.id}>
                        <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>{new Date(r.scan_date).toLocaleDateString()}</td>
                        <td style={{ fontWeight: 500 }}>{r.scan_type}</td>
                        <td><Badge variant={statusVariant(r.status) as "success" | "warning" | "gray"}>{r.status}</Badge></td>
                        <td><Link href={`/patient/report?scan_id=${r.id}`} className="btn btn-ghost btn-sm">View</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Upcoming Appointment">
            <div style={{ padding: 18 }}>
              {apptLoading ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>Loading…</div>
              ) : upcomingAppt ? (
                <>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
                    <Avatar name="Dentist" size={44} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>Appointment</div>
                      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{upcomingAppt.type}</div>
                    </div>
                  </div>
                  <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius)", padding: 14, marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>SCHEDULED FOR</div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{new Date(upcomingAppt.scheduled_at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
                    <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>{new Date(upcomingAppt.scheduled_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} · {upcomingAppt.duration_min} min</div>
                  </div>
                  {upcomingAppt.join_url && (
                    <Link href="/patient/video" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>Join Video Call </Link>
                  )}
                </>
              ) : (
                <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 14, padding: "20px 0" }}>
                  No upcoming appointments.{" "}
                  <Link href="/patient/book" style={{ color: "var(--brand-blue)" }}>Book one now</Link>.
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </AppLayout>
  );
}

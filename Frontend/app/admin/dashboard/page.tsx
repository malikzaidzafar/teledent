"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader, StatCard, Badge, Avatar, SectionCard } from "@/components/ui/shared";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth";
import { patientApi, adminApi, type PatientSummary } from "@/lib/api";
import { useEffect, useState } from "react";

export default function AdminDashboardPage() {
  const { loading: authLoading } = useRequireAuth("admin");
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [stats, setStats] = useState<{ total_patients: number; total_dentists: number; total_scans: number; total_video_sessions: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      patientApi.list({ limit: 10 }),
      adminApi.stats(),
    ]).then(([pRes, sRes]) => {
      if (pRes.status === "fulfilled") setPatients(pRes.value.data);
      if (sRes.status === "fulfilled") setStats(sRes.value);
    }).finally(() => setLoading(false));
  }, []);

  if (authLoading) return null;

  const STATS = [
    { icon: "", iconBg: "#e8f0fd", value: loading ? "…" : String(stats?.total_patients ?? 0), label: "Total Patients", change: "Registered", changePositive: true },
    { icon: "", iconBg: "#dcfce7", value: loading ? "…" : String(stats?.total_dentists ?? 0), label: "Active Dentists", change: "Approved", changePositive: true },
    { icon: "", iconBg: "#fef3c7", value: loading ? "…" : String(stats?.total_scans ?? 0), label: "Scans Processed", changePositive: true, change: "All time" },
    { icon: "", iconBg: "#f3e8ff", value: loading ? "…" : String(stats?.total_video_sessions ?? 0), label: "Video Sessions", change: "All time", changePositive: true },
  ];

  return (
    <AppLayout role="admin" pageTitle="Admin Dashboard">
      <PageHeader
        title="Admin Dashboard"
        subtitle="Platform overview and key metrics."
        action={<Link href="/admin/analytics" className="btn btn-outline btn-sm">View Analytics</Link>}
      />
      <div className="page-body">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 20, marginBottom: 28 }}>
          {STATS.map((s) => <StatCard key={s.label} {...s} />)}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>
          <SectionCard
            title="Recent Patient Registrations"
            action={<Link href="/admin/patients" style={{ fontSize: 13, color: "var(--brand-blue)", textDecoration: "none", fontWeight: 600 }}>View all</Link>}
          >
            {loading ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading patients…</div>
            ) : patients.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No patients registered yet.</div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Patient</th><th>Scans</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {patients.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Avatar name={p.full_name} size={28} />
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{p.full_name}</div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{p.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: 13, fontWeight: 600 }}>{p.scan_count}</td>
                      <td><Badge variant={p.status === "active" ? "success" : "warning"}>{p.status}</Badge></td>
                      <td><Link href={`/admin/patients?id=${p.id}`} className="btn btn-ghost btn-sm">View</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          <SectionCard title="Quick Actions">
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <Link href="/admin/patients" className="btn btn-ghost" style={{ justifyContent: "flex-start", gap: 10 }}> Manage Patients</Link>
              <Link href="/admin/dentists" className="btn btn-ghost" style={{ justifyContent: "flex-start", gap: 10 }}> Manage Dentists</Link>
              <Link href="/admin/analytics" className="btn btn-ghost" style={{ justifyContent: "flex-start", gap: 10 }}> View Analytics</Link>
            </div>
          </SectionCard>
        </div>
      </div>
    </AppLayout>
  );
}

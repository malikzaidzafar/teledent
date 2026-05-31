"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader, StatCard, SectionCard } from "@/components/ui/shared";
import { useRequireAuth } from "@/lib/auth";
import { adminApi, type AdminStats } from "@/lib/api";
import { useEffect, useState } from "react";

const MONTHLY = [
  { month: "Jan", scans: 240 }, { month: "Feb", scans: 310 },
  { month: "Mar", scans: 280 }, { month: "Apr", scans: 420 },
  { month: "May", scans: 530 },
];
const MAX_SCANS = Math.max(...MONTHLY.map((m) => m.scans));

export default function AdminAnalyticsPage() {
  const { loading: authLoading } = useRequireAuth("admin");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.stats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (authLoading) return null;

  const STATS = [
    { icon: "", iconBg: "#e8f0fd", value: loading ? "…" : String(stats?.total_patients ?? 0),       label: "Total Patients",   change: "Registered",  changePositive: true },
    { icon: "", iconBg: "#dcfce7", value: loading ? "…" : String(stats?.total_scans ?? 0),          label: "Scans Processed",  change: "All time",    changePositive: true },
    { icon: "", iconBg: "#fef3c7", value: loading ? "…" : String(stats?.total_video_sessions ?? 0), label: "Video Sessions",    change: "All time",    changePositive: true },
    { icon: "", iconBg: "#f3e8ff", value: loading ? "…" : String(stats?.total_dentists ?? 0),       label: "Active Dentists",  change: "Approved",    changePositive: true },
  ];

  return (
    <AppLayout role="admin" pageTitle="Analytics">
      <PageHeader title="Platform Analytics" subtitle="Real-time metrics and performance overview." />
      <div className="page-body">
        <div className="grid-4" style={{ marginBottom: 24 }}>
          {STATS.map((s) => <StatCard key={s.label} {...s} />)}
        </div>

        {/* Additional live stats row */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, marginBottom: 24 }}>
            {[
              { label: "New Patients This Week", value: stats.new_patients_this_week, icon: "" },
              { label: "Total Reports",          value: stats.total_reports ?? 0,     icon: "" },
              { label: "Total Appointments",     value: stats.total_appointments ?? 0, icon: "" },
            ].map(s => (
              <div key={s.label} className="card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px" }}>
                <span style={{ fontSize: 28 }}>{s.icon}</span>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,340px)", gap: 22, marginBottom: 22 }}>
          {/* Bar Chart */}
          <SectionCard title="Monthly Scan Volume (Sample)">
            <div style={{ padding: "20px 20px 8px" }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 160 }}>
                {MONTHLY.map((m) => (
                  <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--brand-blue)" }}>{m.scans}</div>
                    <div style={{ width: "100%", background: "var(--brand-blue)", borderRadius: "4px 4px 0 0", height: `${(m.scans / MAX_SCANS) * 120}px`, transition: "height 0.4s ease" }} />
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{m.month}</div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* Breakdown */}
          <SectionCard title="Scan Type Breakdown">
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { label: "Panoramic X-ray",  pct: 42 },
                { label: "Periapical X-ray", pct: 28 },
                { label: "Bitewing X-ray",   pct: 18 },
                { label: "Intraoral Photo",  pct: 12 },
              ].map((b) => (
                <div key={b.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{b.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--brand-blue)" }}>{b.pct}%</span>
                  </div>
                  <div style={{ height: 7, background: "var(--surface-3)", borderRadius: 4 }}>
                    <div style={{ width: `${b.pct}%`, height: "100%", background: "var(--brand-blue)", borderRadius: 4 }} />
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

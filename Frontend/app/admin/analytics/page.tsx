"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader, StatCard, SectionCard } from "@/components/ui/shared";
import { useRequireAuth } from "@/lib/auth";
import { adminApi, type AdminStats } from "@/lib/api";
import { useEffect, useState } from "react";

export default function AdminAnalyticsPage() {
  const { loading: authLoading } = useRequireAuth("admin");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthly, setMonthly] = useState<{ month: string; scans: number }[]>([]);

  useEffect(() => {
    adminApi.stats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
    adminApi.monthlyScans()
      .then(setMonthly)
      .catch(() => {});
  }, []);

  const MAX_SCANS = monthly.length ? Math.max(...monthly.map((m) => m.scans), 1) : 1;

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
          <SectionCard title="Monthly Scan Volume">
            <div style={{ padding: "20px 20px 8px" }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 160 }}>
                {loading ? (
                  <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>
                ) : monthly.length === 0 ? (
                  <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>No data yet</div>
                ) : monthly.map((m) => (
                  <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--brand-blue)" }}>{m.scans}</div>
                    <div style={{ width: "100%", background: "var(--brand-blue)", borderRadius: "4px 4px 0 0", height: `${(m.scans / MAX_SCANS) * 120}px`, transition: "height 0.4s ease" }} />
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{m.month}</div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>


        </div>
      </div>
    </AppLayout>
  );
}

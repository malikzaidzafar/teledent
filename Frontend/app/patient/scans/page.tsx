"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader, Badge, SectionCard } from "@/components/ui/shared";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth";
import { useScans } from "@/lib/hooks/useScans";
import { useState } from "react";

const sv = (s: string) => s === "complete" ? "success" : s === "in_review" ? "warning" : s === "failed" ? "danger" : "blue";

export default function MyScansPage() {
  const { loading: authLoading } = useRequireAuth("patient");
  const { data, loading, error } = useScans();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  if (authLoading) return null;

  const scans = (data?.data || []).filter(s => {
    const matchSearch = !search || s.scan_type.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    const matchType = typeFilter === "all" || s.scan_type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  return (
    <AppLayout role="patient" pageTitle="My Scans">
      <PageHeader title="My Scan History" subtitle="All your dental scan submissions and AI analysis results."
        action={<Link href="/patient/scan" className="btn btn-primary btn-sm">+ Upload New Scan</Link>} />
      <div className="page-body">
        <div style={{ display: "flex", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
          <input className="input" placeholder="  Search scans…" style={{ maxWidth: 280, flex: 1, minWidth: 160 }} value={search} onChange={e => setSearch(e.target.value)} />
          <select className="input" style={{ maxWidth: 180 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="complete">Complete</option>
            <option value="in_review">In Review</option>
            <option value="pending">Pending</option>
          </select>
          <select className="input" style={{ maxWidth: 200 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            <option value="Panoramic X-ray">Panoramic X-ray</option>
            <option value="Periapical X-ray">Periapical X-ray</option>
            <option value="Bitewing X-ray">Bitewing X-ray</option>
            <option value="Intraoral Photo">Intraoral Photo</option>
          </select>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading scans…</div>
        ) : error ? (
          <div style={{ padding: 20, color: "#dc2626", background: "#fef2f2", borderRadius: "var(--radius)" }}>{error}</div>
        ) : (
          <SectionCard title={`${scans.length} Scan${scans.length !== 1 ? "s" : ""} Found`}>
            {scans.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                No scans found. <Link href="/patient/scan" style={{ color: "var(--brand-blue)" }}>Upload your first scan</Link>.
              </div>
            ) : (
              <div className="table-scroll-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th><th>Type</th><th>AI Result</th>
                      <th>Status</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scans.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>{new Date(s.scan_date).toLocaleDateString()}</td>
                        <td style={{ fontWeight: 500, fontSize: 13 }}>{s.scan_type}</td>
                        <td>
                          {s.status === "complete" && s.ai_result ? (
                            <div>
                              <Badge variant={s.ai_result.findings_count === 0 ? "success" : s.ai_result.overall_risk === "high" ? "danger" : "warning"}>
                                {s.ai_result.findings_count === 0 ? "✅ Healthy" : `${s.ai_result.findings_count} Finding${s.ai_result.findings_count > 1 ? "s" : ""}`}
                              </Badge>
                              {s.ai_result.top_condition && s.ai_result.findings_count > 0 && (
                                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>Top: {s.ai_result.top_condition}</div>
                              )}
                            </div>
                          ) : s.status === "processing" || s.status === "queued" ? (
                            <Badge variant="blue">⏳ Analysing…</Badge>
                          ) : s.status === "failed" ? (
                            <Badge variant="danger">Failed</Badge>
                          ) : (
                            <Badge variant="gray">Pending</Badge>
                          )}
                        </td>
                        <td><Badge variant={sv(s.status) as "success" | "warning" | "blue"}>{s.status}</Badge></td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {s.status === "complete" ? (
                              <>
                                <Link href={`/patient/report?scan_id=${s.id}`} className="btn btn-primary btn-sm">
                                  {s.dentist_reviewed ? "📋 View Report" : "🔬 View Results"}
                                </Link>
                              </>
                            ) : s.status === "processing" || s.status === "queued" ? (
                              <span style={{ fontSize: 12, color: "var(--text-muted)", padding: "4px 0" }}>Processing…</span>
                            ) : (
                              <Link href={`/patient/report?scan_id=${s.id}`} className="btn btn-ghost btn-sm">View</Link>
                            )}
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

"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader, Badge, SectionCard } from "@/components/ui/shared";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth";
import { useScans } from "@/lib/hooks/useScans";
import { useState } from "react";

const BRAND_BLUE = "#1d6fec";

const riskColour = (r?: string) =>
  r === "high" ? "#dc2626" : r === "moderate" ? "#d97706" : "#16a34a";

export default function DentistCasesPage() {
  const { loading: authLoading } = useRequireAuth("dentist");
  const { data, loading, error } = useScans();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"pending" | "reviewed">("pending");

  if (authLoading) return null;

  const all = (data?.data || []).filter(s =>
    !search || s.scan_type.toLowerCase().includes(search.toLowerCase()) ||
    (s.ai_result?.top_condition || "").toLowerCase().includes(search.toLowerCase())
  );
  const pending = all.filter(s => !s.dentist_reviewed && s.status === "complete");
  const reviewed = all.filter(s => s.dentist_reviewed);
  const displayed = tab === "pending" ? pending : reviewed;

  return (
    <AppLayout role="dentist" pageTitle="Patient Cases">
      <PageHeader
        title="Patient Cases"
        subtitle="AI-screened patient submissions awaiting your expert review."
        action={
          <div style={{ display: "flex", gap: 8 }}>
            {pending.length > 0 && (
              <span style={{
                background: "#fef3c7", color: "#b45309", border: "1px solid #fcd34d",
                borderRadius: 999, padding: "4px 12px", fontSize: 13, fontWeight: 700,
              }}>
                {pending.length} Pending Review{pending.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        }
      />
      <div className="page-body">
        {/* ── Tabs + Search ── */}
        <div style={{ display: "flex", gap: 12, marginBottom: 22, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: "var(--radius)", border: "1px solid var(--border)", overflow: "hidden" }}>
            {(["pending", "reviewed"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "7px 18px", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
                  background: tab === t ? BRAND_BLUE : "transparent",
                  color: tab === t ? "#fff" : "var(--text-secondary)",
                  transition: "all 0.15s",
                }}
              >
                {t === "pending" ? `Pending (${pending.length})` : `Reviewed (${reviewed.length})`}
              </button>
            ))}
          </div>
          <input
            className="input"
            placeholder="  Search by type or condition…"
            style={{ maxWidth: 280, flex: 1, minWidth: 160 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading cases…</div>
        ) : error ? (
          <div style={{ padding: 20, color: "#dc2626", background: "#fef2f2", borderRadius: "var(--radius)" }}>{error}</div>
        ) : displayed.length === 0 ? (
          <SectionCard title="">
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
              {tab === "pending"
                ? "🎉 No pending cases — all caught up!"
                : "No reviewed cases yet."}
            </div>
          </SectionCard>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {displayed.map((s) => {
              const risk = s.ai_result?.overall_risk || "none";
              const findings = s.ai_result?.findings_count || 0;
              return (
                <div key={s.id} style={{
                  background: "var(--surface)",
                  border: `1px solid ${s.dentist_reviewed ? "var(--border)" : `${BRAND_BLUE}33`}`,
                  borderRadius: "var(--radius-xl)",
                  padding: "18px 22px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                }}>
                  {/* Left: scan info */}
                  <div style={{ display: "flex", gap: 16, alignItems: "center", flex: 1, minWidth: 200 }}>
                    {/* Risk indicator dot */}
                    <div style={{
                      width: 12, height: 12, borderRadius: "50%",
                      background: riskColour(risk), flexShrink: 0,
                      boxShadow: `0 0 0 3px ${riskColour(risk)}22`,
                    }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>
                        #{s.id.slice(0, 8)} · {s.scan_type}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {new Date(s.scan_date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  {/* Middle: AI result */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    {s.ai_result ? (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>
                          {findings === 0 ? "✅ No findings" : `${findings} finding${findings > 1 ? "s" : ""} detected`}
                        </div>
                        {s.ai_result.top_condition && findings > 0 && (
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                            Top: <strong>{s.ai_result.top_condition}</strong>
                            {" "}· Risk: <span style={{ color: riskColour(risk), fontWeight: 700, textTransform: "capitalize" }}>{risk}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>AI analysis pending</span>
                    )}
                  </div>

                  {/* Right: badge + action */}
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <Badge variant={s.dentist_reviewed ? "success" : "warning"}>
                      {s.dentist_reviewed ? "✓ Reviewed" : "⏳ Needs Review"}
                    </Badge>
                    <Link
                      href={`/patient/report?scan_id=${s.id}`}
                      className={`btn btn-sm ${s.dentist_reviewed ? "btn-ghost" : "btn-primary"}`}
                    >
                      {s.dentist_reviewed ? "View" : "Review & Add Notes"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

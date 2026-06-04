"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader, Badge, SectionCard } from "@/components/ui/shared";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth";
import { reportApi, scanApi, type Report, type Analysis } from "@/lib/api";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const BRAND_BLUE = "#1d6fec";

const severityVariant = (s: string) =>
  s === "high" ? "danger" : s === "moderate" ? "warning" : "success";

const riskColour = (r: string) =>
  r === "high" ? "#dc2626" : r === "moderate" ? "#d97706" : r === "none" || !r ? "#16a34a" : "#1d6fec";

const urgencyLabel: Record<string, string> = {
  monitor: "Monitor — mention at next checkup",
  schedule_soon: "Schedule a dental appointment soon",
  see_dentist_this_week: "See a dentist within the week",
  urgent: "Seek dental attention as soon as possible",
};

export default function DentistReviewPage() {
  const { loading: authLoading } = useRequireAuth("dentist");
  const params = useParams();
  const scanId = params.scanId as string;

  const [report, setReport] = useState<Report | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [scanImageUrl, setScanImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review form state
  const [dentistNotes, setDentistNotes] = useState("");
  const [finalDiagnosis, setFinalDiagnosis] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [a, s] = await Promise.all([
          scanApi.analysis(scanId).catch(() => null),
          scanApi.get(scanId).catch(() => null),
        ]);
        if (a) setAnalysis(a as Analysis);
        if (s) setScanImageUrl(s.cloudinary_url);

        // Try to find an existing report for this scan
        const rid = (a as (Analysis & { report_id?: string }) | null)?.report_id;
        if (rid) {
          const r = await reportApi.get(rid).catch(() => null);
          if (r) {
            setReport(r as Report);
            setDentistNotes((r as Report).dentist_notes || "");
            setFinalDiagnosis((r as Report).final_diagnosis || "");
          }
        } else {
          // Fallback: search via list
          const reportsRes = await reportApi.list(1, scanId).catch(() => null);
          if (reportsRes) {
            const found = reportsRes.data.find((r) => r.scan_id === scanId);
            if (found) {
              setReport(found as Report);
              setDentistNotes(found.dentist_notes || "");
              setFinalDiagnosis(found.final_diagnosis || "");
            }
          }
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load scan data");
      } finally {
        setLoading(false);
      }
    }
    if (scanId) load();
  }, [scanId]);

  async function handleSave() {
    if (!finalDiagnosis.trim()) {
      setSaveError("Final diagnosis is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (report) {
        // Update existing report
        const updated = await reportApi.update(report.id, {
          dentist_notes: dentistNotes || undefined,
          final_diagnosis: finalDiagnosis,
        });
        setReport(updated);
      } else {
        // Need patient_id — grab from analysis or scan
        const s = await scanApi.get(scanId);
        const created = await reportApi.create({
          scan_id: scanId,
          patient_id: s.patient_id,
          dentist_notes: dentistNotes || undefined,
          final_diagnosis: finalDiagnosis,
        });
        const r = await reportApi.get(created.report_id);
        setReport(r as Report);
      }
      setSaved(true);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save review");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return null;

  const findings = analysis?.findings || [];
  const expl = analysis?.ai_explanation;
  const risk = expl?.overall_risk || "none";
  const overallConf = analysis?.confidence_score ? Math.round(analysis.confidence_score * 100) : null;
  const annotatedUrl = expl?.annotated_image_url || null;

  return (
    <AppLayout role="dentist" pageTitle="Review Case">
      <PageHeader
        title="Review Patient Case"
        subtitle={`Scan ID: ${scanId?.slice(0, 8)}… · AI + your professional notes`}
        action={
          <Link href="/dentist/cases" className="btn btn-ghost btn-sm">
            ← Back to Cases
          </Link>
        }
      />
      <div className="page-body">
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>Loading case…</div>
        ) : error ? (
          <div style={{ padding: 20, color: "#dc2626", background: "#fef2f2", borderRadius: "var(--radius)" }}>{error}</div>
        ) : (
          <>
            {/* ── Overall Risk Banner ── */}
            <div style={{
              background: `${riskColour(risk)}0d`,
              border: `1px solid ${riskColour(risk)}44`,
              borderRadius: "var(--radius-xl)",
              padding: "20px 24px",
              marginBottom: 24,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 16,
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: riskColour(risk), textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                  AI Assessment
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 4 }}>
                  {findings.length === 0
                    ? "No Findings Detected"
                    : `${findings.length} Finding${findings.length > 1 ? "s" : ""} Detected`}
                </div>
                {overallConf && (
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    AI Confidence: <strong>{overallConf}%</strong>
                    {expl?.urgency && (
                      <> · <span style={{ color: riskColour(risk) }}>{urgencyLabel[expl.urgency] || expl.urgency}</span></>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                <Badge variant={findings.length === 0 ? "success" : risk === "high" ? "danger" : "warning"}>
                  {risk === "none" || !risk ? "All Clear" : `${risk.charAt(0).toUpperCase() + risk.slice(1)} Risk`}
                </Badge>
                {report?.dentist_id && <Badge variant="success">Your Review Saved</Badge>}
              </div>
            </div>

            {/* ── AI Patient Summary ── */}
            {expl?.patient_summary && (
              <div style={{
                background: "#f0f9ff", border: "1px solid #bae6fd",
                borderLeft: `4px solid #0ea5e9`,
                borderRadius: "var(--radius)", padding: "14px 18px",
                marginBottom: 24, fontSize: 14, lineHeight: 1.75, color: "#0c4a6e",
              }}>
                <strong>AI Summary:</strong> {expl.patient_summary}
              </div>
            )}

            {/* ── Scan Images ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              {scanImageUrl && (
                <SectionCard title="Original Scan">
                  <div style={{ padding: 12 }}>
                    <img
                      src={scanImageUrl}
                      alt="Original Scan"
                      style={{ width: "100%", borderRadius: "var(--radius)", objectFit: "contain", maxHeight: 280, background: "#0f172a" }}
                    />
                  </div>
                </SectionCard>
              )}
              {annotatedUrl && (
                <SectionCard title="AI Detection (YOLOv11)">
                  <div style={{ padding: 12 }}>
                    <img
                      src={annotatedUrl}
                      alt="AI Annotated"
                      style={{ width: "100%", borderRadius: "var(--radius)", objectFit: "contain", maxHeight: 280, background: "#0f172a" }}
                    />
                  </div>
                </SectionCard>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,340px)", gap: 22 }}>
              {/* ── Findings Table ── */}
              <SectionCard title={`AI-Detected Findings (${findings.length})`}>
                {findings.length === 0 ? (
                  <div style={{ padding: 32, textAlign: "center", color: "#16a34a", fontWeight: 600 }}>
                    No dental conditions detected by AI.
                  </div>
                ) : (
                  <div className="table-scroll-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Condition</th>
                          <th className="col-hide-sm">Confidence</th>
                          <th>Severity</th>
                          <th className="col-hide-md">AI Explanation</th>
                          <th className="col-hide-md">Recommendation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {findings.map((f, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 700 }}>{f.condition}</td>
                            <td className="col-hide-sm">
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 70, height: 6, background: "var(--surface-3)", borderRadius: 3 }}>
                                  <div style={{ width: `${Math.round(f.confidence * 100)}%`, height: "100%", background: BRAND_BLUE, borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 600 }}>{Math.round(f.confidence * 100)}%</span>
                              </div>
                            </td>
                            <td>
                              <Badge variant={severityVariant(f.severity) as "warning" | "danger" | "success"}>
                                {f.severity}
                              </Badge>
                            </td>
                            <td className="col-hide-md" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                              {f.gemini_explanation}
                            </td>
                            <td className="col-hide-md" style={{ fontSize: 12 }}>
                              {f.recommendation}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              {/* ── Dentist Notes Form ── */}
              <SectionCard title={report?.dentist_id ? "Update Your Review" : "Add Your Review"}>
                <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
                  {saved && (
                    <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "var(--radius)", padding: "10px 14px", color: "#15803d", fontWeight: 600, fontSize: 13 }}>
                      Review saved successfully!
                    </div>
                  )}
                  {saveError && (
                    <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "var(--radius)", padding: "10px 14px", color: "#dc2626", fontSize: 13 }}>
                      {saveError}
                    </div>
                  )}

                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Final Diagnosis <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <input
                      className="input"
                      style={{ width: "100%" }}
                      placeholder="e.g. Dental caries with early cavitation"
                      value={finalDiagnosis}
                      onChange={e => { setFinalDiagnosis(e.target.value); setSaved(false); }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Clinical Notes
                    </label>
                    <textarea
                      className="input"
                      style={{ width: "100%", minHeight: 130, resize: "vertical" }}
                      placeholder="Your professional observations, treatment plan, or additional notes…"
                      value={dentistNotes}
                      onChange={e => { setDentistNotes(e.target.value); setSaved(false); }}
                    />
                  </div>

                  <button
                    className="btn btn-primary"
                    style={{ width: "100%", justifyContent: "center" }}
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : report?.dentist_id ? "Update Review" : "Save Review"}
                  </button>

                  {report?.pdf_url && (
                    <button
                      className="btn btn-outline"
                      style={{ width: "100%", justifyContent: "center" }}
                      onClick={async () => {
                        try {
                          const url = await reportApi.downloadPdf(report.id);
                          const a = document.createElement("a");
                          a.href = url; a.download = `report-${report.id}.pdf`; a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 5000);
                        } catch {}
                      }}
                    >
                      Download PDF Report
                    </button>
                  )}
                </div>
              </SectionCard>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

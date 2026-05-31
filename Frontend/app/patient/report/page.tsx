"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader, Badge, SectionCard } from "@/components/ui/shared";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth";
import { reportApi, scanApi, type Report, type Analysis } from "@/lib/api";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

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

export default function DiagnosisReportPage() {
  const { loading: authLoading } = useRequireAuth("patient");
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scan_id");
  const reportIdParam = searchParams.get("report_id");

  const [report, setReport] = useState<Report | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        if (reportIdParam) {
          // Came directly from ProcessingScreen with a report_id
          const [r, ] = await Promise.all([
            reportApi.get(reportIdParam),
          ]);
          setReport(r as Report);
          // Also load analysis for the scan
          if ((r as Report).scan_id) {
            const a = await scanApi.analysis((r as Report).scan_id).catch(() => null);
            if (a) setAnalysis(a);
            const s = await scanApi.get((r as Report).scan_id).catch(() => null);
            if (s) setScanImageUrl(s.cloudinary_url);
          }
        } else if (scanId) {
          const [a, s] = await Promise.all([
            scanApi.analysis(scanId).catch(() => null),
            scanApi.get(scanId).catch(() => null),
          ]);
          if (a) setAnalysis(a);
          if (s) setScanImageUrl(s.cloudinary_url);
          if (a) {
            const rid = (a as Analysis & { report_id?: string }).report_id;
            if (rid) {
              const r = await reportApi.get(rid).catch(() => null);
              if (r) setReport(r as Report);
            }
          }
          if (!report) {
            const reportsRes = await reportApi.list();
            const found = reportsRes.data.find((r) => r.scan_id === scanId);
            if (found) setReport(found as Report);
          }
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load report");
      } finally {
        setLoading(false);
      }
    }
    if (scanId || reportIdParam) load();
    else setLoading(false);
  }, [scanId, reportIdParam]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading) return null;

  const findings = analysis?.findings || [];
  const expl = analysis?.ai_explanation;
  const risk = expl?.overall_risk || "none";
  const overallConf = analysis?.confidence_score ? Math.round(analysis.confidence_score * 100) : null;
  const annotatedUrl = expl?.annotated_image_url || null;
  const activeScanId = scanId || report?.scan_id;
  // scanImageUrl is populated by fetch in useEffect

  return (
    <AppLayout role="patient" pageTitle="Diagnosis Report">
      <PageHeader
        title="AI Dental Analysis Report"
        subtitle={
          report?.dentist_id
            ? "Dentist reviewed · AI + Professional assessment"
            : "AI-generated · Powered by YOLOv8 + Gemini"
        }
        action={
          report?.pdf_url ? (
            <a
              href={reportApi.pdfUrl(report.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline btn-sm"
            >
              📥 Download PDF
            </a>
          ) : undefined
        }
      />
      <div className="page-body">
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>Loading report…</div>
        ) : error ? (
          <div style={{ padding: 20, color: "#dc2626", background: "#fef2f2", borderRadius: "var(--radius)" }}>{error}</div>
        ) : !scanId && !reportIdParam ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
            Please select a scan to view its report.{" "}
            <Link href="/patient/scans" style={{ color: BRAND_BLUE }}>Go to My Scans</Link>
          </div>
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
                  Overall Assessment
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 4 }}>
                  {findings.length === 0
                    ? "✅ All Clear — No Findings"
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
                {report?.dentist_id && (
                  <Badge variant="success">✅ Dentist Reviewed</Badge>
                )}
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
                💬 <strong>AI Summary:</strong> {expl.patient_summary}
              </div>
            )}

            {/* ── Scan Images ── */}
            {(annotatedUrl || scanImageUrl) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                {scanImageUrl && (
                  <SectionCard title="Original Scan">
                    <div style={{ padding: 12 }}>
                      <img
                        src={scanImageUrl}
                        alt="Original Scan"
                        style={{ width: "100%", borderRadius: "var(--radius)", objectFit: "contain", maxHeight: 260, background: "#0f172a" }}
                      />
                    </div>
                  </SectionCard>
                )}
                {annotatedUrl && (
                  <SectionCard title="🔍 AI Detection (YOLOv8)">
                    <div style={{ padding: 12 }}>
                      <img
                        src={annotatedUrl}
                        alt="AI Annotated"
                        style={{ width: "100%", borderRadius: "var(--radius)", objectFit: "contain", maxHeight: 260, background: "#0f172a" }}
                      />
                    </div>
                  </SectionCard>
                )}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,300px)", gap: 22 }}>
              {/* ── Findings Table ── */}
              <SectionCard title={`Detected Findings (${findings.length})`}>
                {findings.length === 0 ? (
                  <div style={{ padding: 32, textAlign: "center", color: "#16a34a", fontWeight: 600 }}>
                    ✅ No dental conditions were detected. Your scan looks healthy!
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

              {/* ── Right Panel: Dentist Notes + Actions ── */}
              <SectionCard title={report?.dentist_id ? "Dentist's Notes" : "Professional Review"}>
                <div style={{ padding: 18 }}>
                  {report?.dentist_notes ? (
                    <>
                      <div style={{
                        background: "var(--surface-2)", borderRadius: "var(--radius)",
                        padding: 14, fontSize: 14, lineHeight: 1.75,
                        color: "var(--text-secondary)", marginBottom: 16, fontStyle: "italic",
                      }}>
                        "{report.dentist_notes}"
                      </div>
                      {report.final_diagnosis && (
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
                          Diagnosis: {report.final_diagnosis}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
                      This AI report hasn't been reviewed by a dentist yet.
                      {findings.length > 0 && (
                        <> We recommend getting a professional opinion on the findings above.</>
                      )}
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {report?.pdf_url && (
                      <a
                        href={reportApi.pdfUrl(report.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline"
                        style={{ width: "100%", justifyContent: "center" }}
                      >
                        📥 Download PDF Report
                      </a>
                    )}
                    {findings.length > 0 && (
                      <Link
                        href={`/patient/book${activeScanId ? `?scan_id=${activeScanId}` : ""}`}
                        className="btn btn-primary"
                        style={{ width: "100%", justifyContent: "center" }}
                      >
                        👨‍⚕️ Hire a Dentist
                      </Link>
                    )}
                    <Link href="/patient/scans" className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }}>
                      ← Back to My Scans
                    </Link>
                  </div>
                </div>
              </SectionCard>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}


const sv = (s: string) => s === "Moderate" || s === "moderate" ? "warning" : s === "High" || s === "high" ? "danger" : "success";

export default function DiagnosisReportPage() {
  const { loading: authLoading } = useRequireAuth("patient");
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scan_id");

  const [report, setReport] = useState<Report | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scanId) { setLoading(false); return; }
    async function load() {
      setLoading(true);
      try {
        // Fetch scan analysis
        const [analysisData] = await Promise.allSettled([
          scanApi.analysis(scanId!),
        ]);
        if (analysisData.status === "fulfilled") setAnalysis(analysisData.value);

        // Find report for this scan — using patient-accessible per-scan reports endpoint
        // Try to fetch via the scan's patient reports (dentist creates report with scan_id)
        // Use GET /reports?scan_id once backend supports it; for now fetch and filter on client
        const reportsRes = await reportApi.list();
        const found = reportsRes.data.find((r: { scan_id: string }) => r.scan_id === scanId);
        if (found) setReport(found as Report);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load report");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [scanId]);

  if (authLoading) return null;

  const findings = analysis?.findings || [];
  const overallConfidence = analysis?.confidence_score ? Math.round(analysis.confidence_score * 100) : null;

  return (
    <AppLayout role="patient" pageTitle="Diagnosis Report">
      <PageHeader
        title="AI Diagnosis Report"
        subtitle={report ? `Scan ID: ${scanId} · Dentist Reviewed` : scanId ? "AI analysis complete · Awaiting dentist review" : "No scan selected"}
        action={
          report?.pdf_url ? (
            <a href={reportApi.pdfUrl(report.id)} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm"> Download PDF</a>
          ) : undefined
        }
      />
      <div className="page-body">
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading report…</div>
        ) : error ? (
          <div style={{ padding: 20, color: "#dc2626", background: "#fef2f2", borderRadius: "var(--radius)" }}>{error}</div>
        ) : !scanId ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
            Please select a scan to view its report. <Link href="/patient/scans" style={{ color: "var(--brand-blue)" }}>Go to My Scans</Link>.
          </div>
        ) : (
          <>
            <div style={{ background: "linear-gradient(135deg,var(--brand-blue-light),#dbeafe)", borderRadius: "var(--radius-xl)", padding: "24px 28px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--brand-blue)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Overall Assessment</div>
                <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 4 }}>
                  {findings.length === 0 ? "No Findings" : `${findings.length} Finding${findings.length > 1 ? "s" : ""} Detected`}
                </div>
                {overallConfidence && (
                  <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>AI Confidence Score: <strong>{overallConfidence}%</strong></div>
                )}
              </div>
              <Badge variant={findings.length === 0 ? "success" : "warning"}>
                {findings.length === 0 ? "All Clear" : "Requires Attention"}
              </Badge>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,300px)", gap: 22 }}>
              <SectionCard title="Detected Findings">
                {findings.length === 0 ? (
                  <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No findings detected. Your teeth look healthy! </div>
                ) : (
                  <div className="table-scroll-wrapper">
                    <table className="data-table">
                      <thead><tr><th>Tooth</th><th>Condition</th><th className="col-hide-sm">Confidence</th><th>Severity</th><th className="col-hide-md">Recommendation</th></tr></thead>
                      <tbody>
                        {findings.map((f) => (
                          <tr key={f.tooth_id}>
                            <td style={{ fontWeight: 700 }}>Tooth #{f.tooth_id}</td>
                            <td style={{ fontWeight: 500 }}>{f.condition}</td>
                            <td className="col-hide-sm">
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 70, height: 6, background: "var(--surface-3)", borderRadius: 3 }}>
                                  <div style={{ width: `${Math.round(f.confidence * 100)}%`, height: "100%", background: "var(--brand-blue)", borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 600 }}>{Math.round(f.confidence * 100)}%</span>
                              </div>
                            </td>
                            <td><Badge variant={sv(f.severity) as "warning" | "danger" | "success"}>{f.severity}</Badge></td>
                            <td className="col-hide-md" style={{ fontSize: 13, color: "var(--text-secondary)" }}>{f.recommendation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Dentist's Note">
                <div style={{ padding: 18 }}>
                  {report?.dentist_notes ? (
                    <>
                      <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius)", padding: 14, fontSize: 14, lineHeight: 1.75, color: "var(--text-secondary)", marginBottom: 16, fontStyle: "italic" }}>
                        "{report.dentist_notes}"
                      </div>
                      {report.final_diagnosis && (
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Diagnosis: {report.final_diagnosis}</div>
                      )}
                    </>
                  ) : (
                    <div style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 16 }}>No dentist note yet. Pending review.</div>
                  )}
                  <Link href="/patient/book" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}> Book Follow-up</Link>
                </div>
              </SectionCard>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

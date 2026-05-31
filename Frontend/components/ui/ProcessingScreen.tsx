"use client";
/**
 * components/ui/ProcessingScreen.tsx
 * Full-page animated processing screen shown after scan upload.
 * Polls analysis status and auto-advances through visual steps.
 */
import { useEffect, useState } from "react";
import { useScanPolling } from "@/lib/hooks/useScans";
import type { Analysis } from "@/lib/api";

const BRAND_BLUE = "#1d6fec";

const DENTAL_FACTS = [
  "Early cavities can be reversed with fluoride treatment.",
  "Calculus (tartar) can only be removed by a dental professional.",
  "Gingivitis is reversible if caught early — good news!",
  "Brushing for 2 minutes twice a day reduces caries risk by 40%.",
  "Our AI is trained on thousands of real dental images.",
];

const STEPS = [
  { id: 1, label: "Uploading image to secure server",      desc: "Encrypted transfer to Cloudinary CDN" },
  { id: 2, label: "Running YOLOv8 detection model",        desc: "Detecting conditions in your scan" },
  { id: 3, label: "Generating clinical AI report",         desc: "Gemini enriches findings with explanations" },
  { id: 4, label: "Preparing your results",                desc: "Building your personalised PDF report" },
];

interface Props {
  scanId: string;
  onComplete: (analysis: Analysis) => void;
  onError: (msg: string) => void;
  onRetry: () => void;
}

export default function ProcessingScreen({ scanId, onComplete, onError, onRetry }: Props) {
  const { analysis, pollError, done } = useScanPolling(scanId);

  const [currentStep, setCurrentStep] = useState(1);
  const [factIndex, setFactIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Fake-advance steps 1 → 2 quickly (upload done), then 2 → 3 on poll start
  useEffect(() => {
    // Step 1 → 2 after 1.5s (upload already done by the time this renders)
    const t1 = setTimeout(() => setCurrentStep(2), 1500);
    // Step 2 → 3 after 6s (YOLO takes ~2-3s, give buffer)
    const t2 = setTimeout(() => setCurrentStep(3), 6000);
    // Step 3 → 4 after 16s (Gemini + PDF takes ~10-12s)
    const t3 = setTimeout(() => setCurrentStep(4), 16000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // Rotate dental facts every 4s
  useEffect(() => {
    const t = setInterval(() => setFactIndex(i => (i + 1) % DENTAL_FACTS.length), 4000);
    return () => clearInterval(t);
  }, []);

  // Elapsed timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // React to poll result
  useEffect(() => {
    if (done && analysis) {
      setCurrentStep(4);
      setTimeout(() => onComplete(analysis), 800);
    }
    if (done && pollError) {
      if (pollError === "timeout") {
        onError("Taking longer than expected — you'll be notified when ready.");
      } else {
        onError(pollError);
      }
    }
  }, [done, analysis, pollError, onComplete, onError]);

  const remaining = Math.max(0, 20 - elapsed);
  const progress = Math.min(100, Math.round((elapsed / 22) * 100));
  const isError = done && !!pollError;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 480,
      padding: "32px 20px",
      textAlign: "center",
    }}>
      {isError ? (
        // ── Error state ─────────────────────────────────────────────────
        <div style={{ maxWidth: 440, width: "100%" }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>❌</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: "#dc2626" }}>Analysis Failed</div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 28, lineHeight: 1.6 }}>
            {pollError === "timeout"
              ? "This is taking longer than expected. We'll send you a notification when your results are ready."
              : pollError}
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={onRetry}>Try Again</button>
            <button className="btn btn-ghost" onClick={() => onError("skip")}>View My Scans</button>
          </div>
        </div>
      ) : (
        // ── Processing state ─────────────────────────────────────────────
        <div style={{ maxWidth: 480, width: "100%" }}>

          {/* Spinner */}
          <div style={{ marginBottom: 24 }}>
            <div style={{
              width: 72, height: 72, border: `4px solid ${BRAND_BLUE}22`,
              borderTop: `4px solid ${BRAND_BLUE}`, borderRadius: "50%",
              margin: "0 auto",
              animation: "spin 1s linear infinite",
            }} />
          </div>

          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6, color: "#0f172a" }}>
            Analysing Your Scan
          </div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>
            {remaining > 0 ? `~${remaining}s remaining` : "Almost done…"}
          </div>

          {/* Progress bar */}
          <div style={{ width: "100%", height: 8, background: `${BRAND_BLUE}1a`, borderRadius: 4, marginBottom: 28, overflow: "hidden" }}>
            <div style={{
              height: "100%", background: BRAND_BLUE, borderRadius: 4,
              width: `${progress}%`, transition: "width 1s ease",
            }} />
          </div>

          {/* Steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28, textAlign: "left" }}>
            {STEPS.map((step) => {
              const isComplete = currentStep > step.id;
              const isActive = currentStep === step.id;
              return (
                <div key={step.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "10px 14px",
                  borderRadius: "var(--radius)",
                  background: isActive ? `${BRAND_BLUE}0d` : isComplete ? "#f0fdf4" : "var(--surface-2)",
                  border: `1px solid ${isActive ? `${BRAND_BLUE}33` : isComplete ? "#86efac" : "var(--border)"}`,
                  transition: "all 0.3s",
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isComplete ? "#16a34a" : isActive ? BRAND_BLUE : "var(--surface-3)",
                    color: isComplete || isActive ? "#fff" : "var(--text-muted)",
                    fontSize: 12, fontWeight: 800,
                    border: isActive ? `2px solid ${BRAND_BLUE}` : "none",
                    animation: isActive ? "pulse 1.5s ease-in-out infinite" : "none",
                  }}>
                    {isComplete ? "✓" : step.id}
                  </div>
                  <div>
                    <div style={{
                      fontSize: 13, fontWeight: 700,
                      color: isActive ? BRAND_BLUE : isComplete ? "#15803d" : "var(--text-secondary)",
                    }}>
                      {step.label}
                    </div>
                    {isActive && (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{step.desc}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rotating dental fact */}
          <div style={{
            background: "var(--surface-2)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", padding: "12px 16px",
            fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6,
            transition: "opacity 0.5s",
          }}>
            <span style={{ color: BRAND_BLUE, fontWeight: 700 }}>💡 Did you know?</span>{" "}
            {DENTAL_FACTS[factIndex]}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 ${BRAND_BLUE}44; } 50% { box-shadow: 0 0 0 6px ${BRAND_BLUE}00; } }
      `}</style>
    </div>
  );
}

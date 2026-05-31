"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader } from "@/components/ui/shared";
import ProcessingScreen from "@/components/ui/ProcessingScreen";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRequireAuth } from "@/lib/auth";
import { useCloudinaryUpload } from "@/lib/hooks/useCloudinaryUpload";
import { scanApi, type Analysis } from "@/lib/api";
import { useRouter } from "next/navigation";

type UploadMode = "xray" | "teeth-image" | "teeth-scan" | null;

const BRAND_BLUE = "#1d6fec";
const BRAND_BLUE_BG = "#eef4fe";

const UPLOAD_MODES = [
  {
    id: "xray" as UploadMode,
    icon: "",
    title: "X-Ray Upload",
    description: "Upload a dental X-ray image (Panoramic, Periapical, Bitewing)",
    accept: ".jpg,.jpeg,.png,.dcm",
    acceptLabel: "JPG, PNG, DICOM · Max 25 MB",
    defaultScanType: "Panoramic X-ray",
    scanTypes: ["Panoramic X-ray", "Periapical X-ray", "Bitewing X-ray", "CBCT Scan"],
    color: BRAND_BLUE,
    bg: BRAND_BLUE_BG,
  },
  {
    id: "teeth-image" as UploadMode,
    icon: "",
    title: "Teeth Photo",
    description: "Upload a close-up photo of your teeth or gums",
    accept: ".jpg,.jpeg,.png,.webp,.heic",
    acceptLabel: "JPG, PNG, WEBP, HEIC · Max 25 MB",
    defaultScanType: "Intraoral Photo",
    scanTypes: ["Intraoral Photo", "Frontal Smile", "Upper Arch", "Lower Arch", "Left Side", "Right Side"],
    color: BRAND_BLUE,
    bg: BRAND_BLUE_BG,
  },
  {
    id: "teeth-scan" as UploadMode,
    icon: "",
    title: "Live Teeth Scan",
    description: "Use your camera to capture a real-time scan of your teeth",
    accept: "",
    acceptLabel: "",
    defaultScanType: "Intraoral Photo",
    scanTypes: ["Intraoral Photo", "Frontal Smile", "Upper Arch", "Lower Arch"],
    color: BRAND_BLUE,
    bg: BRAND_BLUE_BG,
  },
];

export default function UploadScanPage() {
  useRequireAuth("patient");
  const router = useRouter();
  const { upload, uploading, progress, error: uploadError } = useCloudinaryUpload();

  const [mode, setMode] = useState<UploadMode>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [processingScanId, setProcessingScanId] = useState<string | null>(null);

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraContainerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captured, setCaptured] = useState(false);
  const [flashAnim, setFlashAnim] = useState(false);

  const selectedMode = UPLOAD_MODES.find((m) => m.id === mode);

  // Start camera when mode is teeth-scan
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      // Prefer rear camera on mobile (better for dental shots), fallback to any
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setCameraError("Camera access denied. Please allow camera permissions and try again.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  useEffect(() => {
    if (mode === "teeth-scan" && !captured) {
      startCamera();
    }
    return () => {
      if (mode !== "teeth-scan") stopCamera();
    };
  }, [mode, captured, startCamera, stopCamera]);

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), [stopCamera]);

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current || !cameraContainerRef.current || !boxRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    // Read actual rendered positions from the DOM
    const containerRect = cameraContainerRef.current.getBoundingClientRect();
    const boxRect = boxRef.current.getBoundingClientRect();

    // Box position relative to container as fractions [0–1]
    const relX = (boxRect.left - containerRect.left) / containerRect.width;
    const relY = (boxRect.top  - containerRect.top)  / containerRect.height;
    const relW = boxRect.width  / containerRect.width;
    const relH = boxRect.height / containerRect.height;

    // objectFit: cover — compute the scale and offset used to render the video
    const videoAspect     = vw / vh;
    const containerAspect = containerRect.width / containerRect.height;
    let scale: number, offsetX: number, offsetY: number;
    if (videoAspect > containerAspect) {
      // Video wider than container — height fills, sides are clipped
      scale   = vh / containerRect.height;
      offsetX = (vw - containerRect.width * scale) / 2;
      offsetY = 0;
    } else {
      // Video taller than container — width fills, top/bottom are clipped
      scale   = vw / containerRect.width;
      offsetX = 0;
      offsetY = (vh - containerRect.height * scale) / 2;
    }

    // Map the box rect fractions into native video pixel coordinates
    const cropX = relX * containerRect.width  * scale + offsetX;
    const cropY = relY * containerRect.height * scale + offsetY;
    const cropW = relW * containerRect.width  * scale;
    const cropH = relH * containerRect.height * scale;

    canvas.width  = Math.round(cropW);
    canvas.height = Math.round(cropH);
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);

    setFlashAnim(true);
    setTimeout(() => setFlashAnim(false), 300);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const f = new File([blob], `teeth-scan-${Date.now()}.jpg`, { type: "image/jpeg" });
      setFile(f);
      setPreview(canvas.toDataURL("image/jpeg"));
      setCaptured(true);
      stopCamera();
    }, "image/jpeg", 0.95);
  }

  function retakePhoto() {
    setFile(null);
    setPreview(null);
    setCaptured(false);
    startCamera();
  }

  function handleFile(f: File) {
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }

  function handleModeSelect(m: UploadMode) {
    setMode(m);
    setFile(null);
    setPreview(null);
    setCaptured(false);
    setCameraError(null);
  }

  async function handleSubmit() {
    if (!file) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { secure_url, public_id } = await upload(file, "scans");
      const { scan_id } = await scanApi.create({
        cloudinary_public_id: public_id,
        cloudinary_url: secure_url,
        scan_type: selectedMode?.defaultScanType || "Intraoral Photo",
        scan_date: new Date().toISOString().split("T")[0],
      });
      // Show processing screen — polling happens inside ProcessingScreen
      setProcessingScanId(scan_id);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleAnalysisComplete(analysis: Analysis) {
    const reportId = (analysis as Analysis & { report_id?: string }).report_id;
    if (reportId) {
      router.push(`/patient/report?report_id=${reportId}`);
    } else {
      router.push(`/patient/report?scan_id=${analysis.scan_id}`);
    }
  }

  function handleAnalysisError(msg: string) {
    if (msg === "skip" || msg.startsWith("Taking longer")) {
      router.push("/patient/scans");
    } else {
      setProcessingScanId(null);
      setSubmitError(msg);
    }
  }

  const error = uploadError || submitError;

  return (
    <AppLayout role="patient" pageTitle="Upload Scan">
      <PageHeader title="Upload Dental Scan" subtitle="Choose how you'd like to submit your dental image for AI-powered screening." />
      <div className="page-body">

        {/* ── Processing screen (replaces upload UI while AI runs) ── */}
        {processingScanId && (
          <ProcessingScreen
            scanId={processingScanId}
            onComplete={handleAnalysisComplete}
            onError={handleAnalysisError}
            onRetry={() => { setProcessingScanId(null); setFile(null); setPreview(null); }}
          />
        )}

        {!processingScanId && (<>
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 20, fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Step 1: Choose Upload Mode */}
        {!mode && (
          <div style={{ width: "100%" }}>
            <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 28 }}>Select an upload method to get started:</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 20 }}>
              {UPLOAD_MODES.map((m) => (
                <button
                  key={m.id!}
                  onClick={() => handleModeSelect(m.id)}
                  style={{
                    background: m.bg,
                    border: `2px solid ${m.color}22`,
                    borderRadius: "var(--radius-xl)",
                    padding: "32px 20px 28px",
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = m.color;
                    (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-4px)";
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 24px ${m.color}33`;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = `${m.color}22`;
                    (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
                  }}
                >
                  <div style={{ fontSize: 52, lineHeight: 1 }}>{m.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: m.color }}>{m.title}</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{m.description}</div>
                  <div style={{ marginTop: 8, background: m.color, color: "#fff", borderRadius: 999, padding: "6px 22px", fontSize: 13, fontWeight: 700 }}>Select</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Upload / Capture */}
        {mode && (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 22 }}>
            {/* Back + Mode Indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button className="btn btn-ghost" style={{ padding: "6px 14px", fontSize: 13 }} onClick={() => { handleModeSelect(null as unknown as UploadMode); setMode(null); stopCamera(); }}>
                 Back
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: selectedMode?.bg, border: `1px solid ${selectedMode?.color}44`, borderRadius: 999, padding: "5px 16px" }}>
                <span style={{ fontSize: 18 }}>{selectedMode?.icon}</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: selectedMode?.color }}>{selectedMode?.title}</span>
              </div>
            </div>

            {/* X-Ray / Teeth Image Upload */}
            {(mode === "xray" || mode === "teeth-image") && (
              <>
                {!file ? (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault(); setDragging(false);
                      const f = e.dataTransfer.files[0]; if (f) handleFile(f);
                    }}
                    style={{
                      border: `2px dashed ${dragging ? selectedMode?.color : "var(--border-strong)"}`,
                      borderRadius: "var(--radius-xl)",
                      padding: "60px 32px",
                      textAlign: "center",
                      background: dragging ? selectedMode?.bg : "var(--surface-2)",
                      transition: "all 0.2s",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 52, marginBottom: 16 }}>{selectedMode?.icon}</div>
                    <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>Drag &amp; drop your {selectedMode?.title.toLowerCase()} here</div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24 }}>{selectedMode?.acceptLabel}</div>
                    <label style={{ background: selectedMode?.color, color: "#fff", borderRadius: 999, padding: "10px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "inline-block" }}>
                      Browse Files
                      <input type="file" hidden accept={selectedMode?.accept} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                    </label>
                  </div>
                ) : (
                  <div style={{ borderRadius: "var(--radius-xl)", overflow: "hidden", border: "2px solid var(--border)", background: "var(--surface-2)", position: "relative" }}>
                    {preview && (
                      <img src={preview} alt="Preview" style={{ width: "100%", maxHeight: 340, objectFit: "contain", display: "block", background: "#000" }} />
                    )}
                    <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{file.name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                      </div>
                      <label style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        Change File
                        <input type="file" hidden accept={selectedMode?.accept} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                      </label>
                    </div>

                  </div>
                )}
              </>
            )}

            {/* Live Teeth Scan — Camera with targeting box */}
            {mode === "teeth-scan" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {cameraError && (
                  <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: "var(--radius)", padding: "10px 14px", fontSize: 14 }}>
                    {cameraError}
                    <button onClick={startCamera} style={{ marginLeft: 12, fontWeight: 700, textDecoration: "underline", background: "none", border: "none", color: "#dc2626", cursor: "pointer" }}>Retry</button>
                  </div>
                )}

                {!captured ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {/* Camera viewport */}
                    <div ref={cameraContainerRef} style={{ position: "relative", borderRadius: "var(--radius-xl) var(--radius-xl) 0 0", overflow: "hidden", background: "#000", width: "100%", aspectRatio: "4/3", maxHeight: "min(55vh, 460px)" }}>
                    {/* Flash animation overlay */}
                    {flashAnim && (
                      <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: 0.7, zIndex: 20, pointerEvents: "none", transition: "opacity 0.3s" }} />
                    )}

                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />

                    {/* Overlay */}
                    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                      {/* Bright overlay */}
                      <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.72)" }} />

                      {/* Targeting box */}
                      <div ref={boxRef} style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        width: "72%",
                        maxWidth: 440,
                        aspectRatio: "2.4/1",
                        borderRadius: 18,
                        boxShadow: "0 0 0 9999px rgba(255,255,255,0.72)",
                        border: "2.5px solid #1d6fec",
                        background: "transparent",
                        zIndex: 2,
                      }}>
                        {[
                          { top: -3, left: -3, borderTop: "4px solid #1d6fec", borderLeft: "4px solid #1d6fec", borderRadius: "8px 0 0 0" },
                          { top: -3, right: -3, borderTop: "4px solid #1d6fec", borderRight: "4px solid #1d6fec", borderRadius: "0 8px 0 0" },
                          { bottom: -3, left: -3, borderBottom: "4px solid #1d6fec", borderLeft: "4px solid #1d6fec", borderRadius: "0 0 0 8px" },
                          { bottom: -3, right: -3, borderBottom: "4px solid #1d6fec", borderRight: "4px solid #1d6fec", borderRadius: "0 0 8px 0" },
                        ].map((style, i) => (
                          <div key={i} style={{ position: "absolute", width: 24, height: 24, ...style }} />
                        ))}
                        <div style={{
                          position: "absolute",
                          left: 4, right: 4, height: 2,
                          background: "linear-gradient(90deg, transparent, #1d6fec, transparent)",
                          borderRadius: 1,
                          animation: "scanLine 2s linear infinite",
                          top: "50%",
                        }} />
                      </div>
                    </div>
                    </div>

                    {/* Bottom bar: instruction + capture button — outside the viewport so no overlap */}
                    <div style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderTop: "none",
                      borderRadius: "0 0 var(--radius-xl) var(--radius-xl)",
                      padding: "14px 20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
                        Place your teeth inside the box, then tap <strong>Capture</strong>
                      </p>
                      <button
                        className="capture-btn"
                        onClick={capturePhoto}
                        disabled={!cameraActive}
                        style={{
                          flexShrink: 0,
                          width: 60,
                          height: 60,
                          borderRadius: "50%",
                          background: "#fff",
                          border: "3px solid #1d6fec",
                          cursor: cameraActive ? "pointer" : "not-allowed",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 4px 16px rgba(29,111,236,0.3)",
                          transition: "transform 0.1s",
                          opacity: cameraActive ? 1 : 0.5,
                        }}
                        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
                        onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                      >
                        <div className="capture-btn-inner" style={{ width: 40, height: 40, borderRadius: "50%", background: "#1d6fec" }} />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Captured preview */
                  <div style={{ borderRadius: "var(--radius-xl)", overflow: "hidden", border: "2px solid #1d6fec", background: "#000", position: "relative" }}>
                    {preview && <img src={preview} alt="Captured" style={{ width: "100%", maxHeight: 360, objectFit: "contain", display: "block" }} />}
                    <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-2)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18, color: "#1d6fec" }}></span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>Scan Captured</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{file?.name}</div>
                        </div>
                      </div>
                      <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={retakePhoto}> Retake</button>
                    </div>
                  </div>
                )}

                <canvas ref={canvasRef} style={{ display: "none" }} />
              </div>
            )}

            {/* Submit button */}
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                style={{ background: selectedMode?.color, color: "#fff", borderRadius: 999, padding: "12px 32px", fontSize: 15, fontWeight: 700, border: "none", cursor: !file || submitting || uploading ? "not-allowed" : "pointer", opacity: !file || submitting || uploading ? 0.5 : 1, transition: "opacity 0.2s" }}
                onClick={handleSubmit}
                disabled={!file || submitting || uploading}
              >
                {submitting || uploading ? "Submitting…" : "Submit for AI Analysis"}
              </button>
            </div>
          </div>
        )}
        </>)}
      </div>

      {/* Scan line keyframe */}
      <style>{`
        @keyframes scanLine {
          0%   { top: 10%; opacity: 1; }
          45%  { top: 85%; opacity: 1; }
          50%  { top: 85%; opacity: 0; }
          55%  { top: 10%; opacity: 0; }
          60%  { top: 10%; opacity: 1; }
          100% { top: 10%; opacity: 1; }
        }
        .camera-viewport {
          position: relative;
          border-radius: var(--radius-xl);
          overflow: hidden;
          background: #000;
          width: 100%;
          max-height: min(60vh, 480px);
          aspect-ratio: 4/3;
        }
        @media (max-width: 600px) {
          .camera-viewport { max-height: 56vw; border-radius: 12px; }
          .scan-instruction { font-size: 11px !important; padding: 5px 12px !important; }
          .capture-btn { width: 54px !important; height: 54px !important; }
          .capture-btn-inner { width: 36px !important; height: 36px !important; }
        }
      `}</style>
    </AppLayout>
  );
}

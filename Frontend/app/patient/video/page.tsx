"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader } from "@/components/ui/shared";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth";
import { videoApi, appointmentApi, type Appointment } from "@/lib/api";
import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";

export default function VideoConsultationPage() {
  const { loading: authLoading } = useRequireAuth("patient");
  const searchParams = useSearchParams();
  const appointmentId = searchParams.get("appointment_id");
  const sessionIdParam = searchParams.get("session_id");

  const [sessionId, setSessionId] = useState<string | null>(sessionIdParam);
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "ended" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Create or join session
  useEffect(() => {
    if (authLoading) return;
    async function initSession() {
      setStatus("connecting");
      try {
        let sid = sessionId;
        if (!sid && appointmentId) {
          const res = await videoApi.createSession(appointmentId);
          sid = res.session_id;
          setSessionId(sid);
          setRoomName(res.room_name);
        }
        if (!sid) { setStatus("idle"); return; }
        const tokenRes = await videoApi.getToken(sid);
        setToken(tokenRes.token);
        setLivekitUrl(tokenRes.livekit_url);
        setRoomName(tokenRes.room_name);
        setStatus("connected");
        timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
      } catch (e: unknown) {
        setErrorMsg(e instanceof Error ? e.message : "Failed to connect to video session.");
        setStatus("error");
      }
    }
    if (appointmentId || sessionIdParam) initSession();
  }, [authLoading, appointmentId, sessionIdParam]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  async function handleEndCall() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (sessionId) {
      try { await videoApi.endSession(sessionId); } catch {}
    }
    setStatus("ended");
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  if (authLoading) return null;

  return (
    <AppLayout role="patient" pageTitle="Video Consultation">
      <PageHeader
        title="Video Consultation"
        subtitle={roomName ? `Room: ${roomName}` : "Video Consultation"}
        action={<span className={`badge ${status === "connected" ? "badge-success" : "badge-warning"}`}>● {status === "connected" ? "Live" : status}</span>}
      />
      <div className="page-body">
        {status === "ended" ? (
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}></div>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Session Ended</div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>Duration: {formatTime(elapsed)}</div>
            <Link href="/patient/appointments" className="btn btn-primary">Back to Appointments</Link>
          </div>
        ) : status === "error" ? (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: "var(--radius)", padding: "16px 20px", marginBottom: 20 }}>
             {errorMsg}
            <div style={{ marginTop: 12, fontSize: 13 }}>
              Make sure you joined from an appointment with an active video session.{" "}
              <Link href="/patient/appointments" style={{ color: "#dc2626", fontWeight: 600 }}>Go to Appointments</Link>
            </div>
          </div>
        ) : !appointmentId && !sessionIdParam ? (
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}></div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No Active Session</div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>
              Please join a video call from your appointments page.
            </div>
            <Link href="/patient/appointments" className="btn btn-primary">View Appointments</Link>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, height: "calc(100vh - 200px)" }}>
            {/* Main Video Area */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ flex: 1, background: "#1e293b", borderRadius: "var(--radius-xl)", position: "relative", overflow: "hidden", minHeight: 400 }}>
                {/* LiveKit would render here — for now show room info */}
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  {status === "connecting" ? (
                    <>
                      <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(19,91,236,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}></div>
                      <div style={{ color: "#94a3b8", fontSize: 15, fontWeight: 600 }}>Connecting to session…</div>
                    </>
                  ) : (
                    <>
                      <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--brand-blue)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}></div>
                      <div style={{ color: "#94a3b8", fontSize: 15, fontWeight: 600 }}>Video session active</div>
                      {token && <div style={{ fontSize: 11, color: "#475569", maxWidth: 300, wordBreak: "break-all", textAlign: "center" }}>Token acquired </div>}
                    </>
                  )}
                </div>
                {/* PiP Self Video */}
                <div style={{ position: "absolute", bottom: 20, right: 20, width: 160, height: 100, background: cameraOff ? "#1e293b" : "#334155", borderRadius: "var(--radius)", border: "2px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ color: "#64748b", fontSize: 12 }}>{cameraOff ? "Camera Off" : "Your Camera"}</div>
                </div>
                {/* Timer */}
                {status === "connected" && (
                  <div style={{ position: "absolute", top: 16, left: 16, background: "rgba(0,0,0,0.5)", color: "#fff", borderRadius: "var(--radius)", padding: "4px 12px", fontSize: 13, fontWeight: 600, backdropFilter: "blur(4px)" }}>
                    {formatTime(elapsed)}
                  </div>
                )}
              </div>

              {/* Controls */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "16px 24px", display: "flex", justifyContent: "center", gap: 16 }}>
                <button className={`btn ${muted ? "btn-danger" : "btn-ghost"}`} style={{ flexDirection: "column", gap: 4, padding: "12px 20px", fontSize: 22 }} onClick={() => setMuted(m => !m)}>
                   <span style={{ fontSize: 11, fontWeight: 500 }}>{muted ? "Unmute" : "Mute"}</span>
                </button>
                <button className={`btn ${cameraOff ? "btn-danger" : "btn-ghost"}`} style={{ flexDirection: "column", gap: 4, padding: "12px 20px", fontSize: 22 }} onClick={() => setCameraOff(c => !c)}>
                   <span style={{ fontSize: 11, fontWeight: 500 }}>{cameraOff ? "Cam On" : "Cam Off"}</span>
                </button>
                <button className="btn btn-danger" style={{ flexDirection: "column", gap: 4, padding: "12px 20px", fontSize: 22 }} onClick={handleEndCall}>
                   <span style={{ fontSize: 11, fontWeight: 500 }}>End Call</span>
                </button>
              </div>
            </div>

            {/* Right Panel */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 14 }}>Session Info</div>
              <div style={{ flex: 1, padding: 16 }}>
                {token && (
                  <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius)", padding: 12, marginBottom: 12, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}> Token Acquired</div>
                    <div style={{ color: "var(--text-muted)" }}>LiveKit URL: {livekitUrl || "N/A"}</div>
                    <div style={{ color: "var(--text-muted)" }}>Room: {roomName || "N/A"}</div>
                  </div>
                )}
                <textarea className="input" rows={5} placeholder="Add session notes…" style={{ resize: "vertical" }} />
              </div>
              <div style={{ padding: "14px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
                <Link href="/patient/appointments" className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }}>Appointments</Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

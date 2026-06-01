"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader } from "@/components/ui/shared";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth";
import { videoApi, reportApi, type CreateReportPayload } from "@/lib/api";
import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function DentistVideoPageInner() {
  const { loading: authLoading } = useRequireAuth("dentist");
  const searchParams = useSearchParams();
  const sessionIdParam = searchParams.get("session_id");
  const appointmentId = searchParams.get("appointment_id");

  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(sessionIdParam);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "ended" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [notes, setNotes] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        setErrorMsg(e instanceof Error ? e.message : "Failed to connect.");
        setStatus("error");
      }
    }
    if (appointmentId || sessionIdParam) initSession();
  }, [authLoading, appointmentId, sessionIdParam]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  async function handleEnd() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (sessionId) { try { await videoApi.endSession(sessionId); } catch {} }
    setStatus("ended");
  }

  function fmt(s: number) {
    return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  }

  if (authLoading) return null;

  return (
    <AppLayout role="dentist" pageTitle="Video Session">
      <PageHeader
        title="Video Consultation"
        subtitle={roomName ? `Room: ${roomName}` : "Video Session"}
        action={<span className={`badge ${status === "connected" ? "badge-success" : "badge-warning"}`}>● {status === "connected" ? "Live" : status}</span>}
      />
      <div className="page-body">
        {status === "ended" ? (
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}></div>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Session Ended</div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>Duration: {fmt(elapsed)}</div>
            <Link href="/dentist/cases" className="btn btn-primary">Back to Cases</Link>
          </div>
        ) : !appointmentId && !sessionIdParam ? (
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}></div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No Active Session</div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>Start a session from an appointment.</div>
            <Link href="/dentist/dashboard" className="btn btn-primary">Dashboard</Link>
          </div>
        ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,300px)", gap: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#1e293b", borderRadius: "var(--radius-xl)", position: "relative", overflow: "hidden", minHeight: 380 }}>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                {status === "connecting" ? (
                  <><div style={{ fontSize: 32 }}></div><div style={{ color: "#94a3b8" }}>Connecting…</div></>
                ) : (
                  <><div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--brand-blue-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}></div>
                  <div style={{ color: "#94a3b8", fontSize: 15, fontWeight: 600 }}>Patient</div>
                  {token && <div style={{ color: "#475569", fontSize: 11 }}>Token acquired </div>}</>
                )}
              </div>
              {status === "connected" && (
                <div style={{ position: "absolute", top: 16, left: 16, background: "rgba(0,0,0,0.5)", color: "#fff", borderRadius: "var(--radius)", padding: "4px 12px", fontSize: 13, fontWeight: 600 }}>{fmt(elapsed)}</div>
              )}
              <div style={{ position: "absolute", bottom: 16, right: 16, width: 130, height: 80, background: "#334155", borderRadius: "var(--radius)", border: "2px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ color: "#64748b", fontSize: 11 }}>{cameraOff ? "Cam Off" : "Your Camera"}</div>
              </div>
            </div>

            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "14px 22px", display: "flex", justifyContent: "center", gap: 14 }}>
              <button className={`btn ${muted ? "btn-danger" : "btn-ghost"}`} style={{ flexDirection: "column", gap: 4, padding: "10px 18px", fontSize: 20 }} onClick={() => setMuted(m => !m)}>
                 <span style={{ fontSize: 11 }}>{muted ? "Unmute" : "Mute"}</span>
              </button>
              <button className={`btn ${cameraOff ? "btn-danger" : "btn-ghost"}`} style={{ flexDirection: "column", gap: 4, padding: "10px 18px", fontSize: 20 }} onClick={() => setCameraOff(c => !c)}>
                 <span style={{ fontSize: 11 }}>{cameraOff ? "Cam On" : "Cam Off"}</span>
              </button>
              <button className="btn btn-danger" style={{ flexDirection: "column", gap: 4, padding: "10px 18px", fontSize: 20 }} onClick={handleEnd}>
                 <span style={{ fontSize: 11 }}>End Call</span>
              </button>
            </div>
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 14 }}>Session Notes</div>
            <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {token && (
                <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius)", padding: 10, fontSize: 11, color: "var(--text-muted)" }}>
                  <div> Token ready</div>
                  <div>LiveKit: {livekitUrl || "N/A"}</div>
                  <div>Room: {roomName || "N/A"}</div>
                </div>
              )}
              <textarea className="input" rows={7} placeholder="Clinical observations, patient symptoms, recommendations…" style={{ resize: "vertical", flex: 1 }} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <div style={{ padding: "14px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
              <Link href="/dentist/cases" className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }}>Cases</Link>
            </div>
          </div>
        </div>
        )}
      </div>
    </AppLayout>
  );
}

export default function DentistVideoPage() {
  return (
    <Suspense>
      <DentistVideoPageInner />
    </Suspense>
  );
}

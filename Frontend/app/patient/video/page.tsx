"use client";
/**
 * Patient video consultation page.
 * Flow: Pre-join → Connecting → Connected (real LiveKit) → Ended
 */
import AppLayout from "@/components/common/AppLayout";
import { PageHeader } from "@/components/ui/shared";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth";
import { videoApi } from "@/lib/api";
import { useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import VideoRoom, { PreJoinScreen } from "@/components/views/VideoRoom";
import type { LocalUserChoices } from "@livekit/components-react";

type PageState = "prejoin" | "connecting" | "connected" | "ended" | "error";

function PatientVideoPageInner() {
  const { loading: authLoading, user } = useRequireAuth("patient");
  const searchParams = useSearchParams();
  const router = useRouter();
  const appointmentId = searchParams.get("appointment_id");

  const [pageState, setPageState] = useState<PageState>("prejoin");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [callDuration, setCallDuration] = useState(0);

  const handlePreJoinSubmit = useCallback(
    async (_choices: LocalUserChoices) => {
      if (!appointmentId) {
        setErrorMsg("No appointment ID in URL. Please join from your Appointments page.");
        setPageState("error");
        return;
      }
      setPageState("connecting");
      try {
        let sid: string;
        try {
          const existing = await videoApi.getSessionByAppointment(appointmentId);
          sid = existing.session_id;
        } catch {
          const created = await videoApi.createSession(appointmentId);
          sid = created.session_id;
        }
        setSessionId(sid);
        const tokenData = await videoApi.getToken(sid);
        setToken(tokenData.token);
        setLivekitUrl(tokenData.livekit_url);
        setDisplayName(tokenData.display_name || (user ? `${user.first_name} ${user.last_name}` : "Patient"));
        setPageState("connected");
      } catch (e: unknown) {
        setErrorMsg(e instanceof Error ? e.message : "Failed to connect to video session.");
        setPageState("error");
      }
    },
    [appointmentId, user],
  );

  const handleDisconnected = useCallback(
    (durationSeconds: number) => {
      setCallDuration(durationSeconds);
      if (sessionId) {
        videoApi.endSession(sessionId).catch((e) =>
          console.warn("End session (best-effort):", e),
        );
      }
      setPageState("ended");
      setTimeout(() => router.push("/patient/appointments"), 8000);
    },
    [sessionId, router],
  );

  function fmt(s: number) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  if (authLoading) return null;

  if (!appointmentId) {
    return (
      <AppLayout role="patient" pageTitle="Video Consultation">
        <PageHeader title="Video Consultation" subtitle="Join a confirmed appointment" />
        <div className="page-body">
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No Appointment Selected</div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>Please join a video call from your appointments page.</div>
            <Link href="/patient/appointments" className="btn btn-primary">View Appointments</Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout role="patient" pageTitle="Video Consultation">
      <PageHeader
        title="Video Consultation"
        subtitle={pageState === "connected" ? "Live consultation in progress" : pageState === "ended" ? "Consultation ended" : "Teledent AI — Secure Video Call"}
        action={pageState === "connected" ? <span className="badge badge-success">● Live</span> : pageState === "connecting" ? <span className="badge badge-warning">● Connecting…</span> : undefined}
      />
      <div className="page-body">

        {pageState === "prejoin" && (
          <PreJoinScreen
            displayName={user ? `${user.first_name} ${user.last_name}` : "Patient"}
            onJoin={handlePreJoinSubmit}
            onError={(err) => {
              setErrorMsg(
                err.message.toLowerCase().includes("permission")
                  ? "Camera or microphone access was denied. Please allow access in your browser settings and try again."
                  : err.message,
              );
              setPageState("error");
            }}
          />
        )}

        {pageState === "connecting" && (
          <div style={{ textAlign: "center", padding: 80 }}>
            <div style={{ width: 52, height: 52, border: "4px solid var(--border)", borderTopColor: "var(--brand-blue)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 20px" }} />
            <div style={{ fontWeight: 700, fontSize: 16 }}>Connecting to consultation…</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>Setting up your secure video session</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {pageState === "connected" && token && livekitUrl && sessionId && (
          <VideoRoom
            token={token}
            livekitUrl={livekitUrl}
            roomName={`Appointment ${appointmentId.slice(0, 8)}`}
            displayName={displayName}
            role="patient"
            sessionId={sessionId}
            onDisconnected={handleDisconnected}
          />
        )}

        {pageState === "ended" && (
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Consultation Complete</div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 4 }}>Duration: {fmt(callDuration)}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 28 }}>Redirecting to appointments in a few seconds…</div>
            <Link href="/patient/appointments" className="btn btn-primary">Back to Appointments</Link>
          </div>
        )}

        {pageState === "error" && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: "var(--radius)", padding: "20px 24px", maxWidth: 560 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>⚠️ Could not join call</div>
            <div style={{ fontSize: 13, marginBottom: 16 }}>{errorMsg}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setErrorMsg(null); setPageState("prejoin"); }}>Try Again</button>
              <Link href="/patient/appointments" className="btn btn-ghost btn-sm">Back to Appointments</Link>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default function PatientVideoPage() {
  return <Suspense><PatientVideoPageInner /></Suspense>;
}

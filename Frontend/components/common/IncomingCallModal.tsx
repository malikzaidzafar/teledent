"use client";
/**
 * components/common/IncomingCallModal.tsx
 * Global modal that appears when a WebSocket "incoming_call" event is received.
 * Rendered in the root layout so it works from any page.
 *
 * FALLBACK: Also polls the notifications API every 5s for recent "call.started"
 * notifications, so if the WebSocket event was missed (e.g. connection dropped
 * momentarily), the user still sees the incoming call.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWebSocket } from "@/lib/websocket-context";
import { useAuth } from "@/lib/auth";
import { videoApi, notificationApi } from "@/lib/api";

interface IncomingCall {
  sessionId: string;
  appointmentId: string;
  callerName: string;
}

export default function IncomingCallModal() {
  const { lastEvent, isConnected } = useWebSocket();
  const { user } = useAuth();
  const router = useRouter();
  const [call, setCall] = useState<IncomingCall | null>(null);
  const [declining, setDeclining] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenNotifIds = useRef<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Handle incoming_call from WebSocket (primary path)
  useEffect(() => {
    if (!lastEvent || !user) return;

    if (lastEvent.type === "incoming_call") {
      setCall({
        sessionId: lastEvent.session_id as string,
        appointmentId: lastEvent.appointment_id as string,
        callerName: lastEvent.caller_name as string,
      });
      // Auto-dismiss after 60 seconds (missed call)
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCall(null), 60_000);
    } else if (lastEvent.type === "call_declined" || lastEvent.type === "call_missed") {
      setCall(null);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [lastEvent, user]);

  // Fallback: poll notifications API for recent "call.started" notifications
  // ONLY when WebSocket is disconnected (primary WS path handles it otherwise)
  const failCountRef = useRef(0);
  const checkForMissedCalls = useCallback(async () => {
    if (!user || call || isConnected) return; // skip if WS is connected or already showing a call
    try {
      const res = await notificationApi.list(1, true);
      failCountRef.current = 0; // reset on success
      const recentCallNotif = res.data?.find((n) => {
        if (n.type !== "call.started" || n.is_read) return false;
        if (seenNotifIds.current.has(n.id)) return false;
        // Only show if created within the last 60 seconds
        const created = new Date(n.created_at).getTime();
        const now = Date.now();
        return now - created < 60_000;
      });
      if (recentCallNotif) {
        seenNotifIds.current.add(recentCallNotif.id);
        const data = recentCallNotif.data as { appointment_id?: string; session_id?: string };
        if (data.session_id && data.appointment_id) {
          setCall({
            sessionId: data.session_id,
            appointmentId: data.appointment_id,
            callerName: recentCallNotif.body?.replace(" has started the video consultation.", "") || "Caller",
          });
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => setCall(null), 60_000);
          notificationApi.markRead(recentCallNotif.id).catch(() => {});
        }
      }
    } catch {
      failCountRef.current += 1; // backoff handled by skipping polls after failures
    }
  }, [user, call, isConnected]);

  // Poll only when WS is disconnected, with backoff on repeated failures
  useEffect(() => {
    if (!user || isConnected) {
      // WS is connected — no need to poll
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    // WS disconnected — start polling at 15s interval
    const interval = Math.min(15_000 * Math.max(1, failCountRef.current), 60_000);
    pollRef.current = setInterval(() => {
      if (failCountRef.current < 5) checkForMissedCalls();
    }, interval);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [user, isConnected, checkForMissedCalls]);

  if (!call) return null;

  async function handleAccept() {
    if (!call) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setCall(null);
    const role = user?.role === "dentist" ? "dentist" : "patient";
    router.push(`/${role}/video?appointment_id=${call.appointmentId}`);
  }

  async function handleDecline() {
    if (!call) return;
    setDeclining(true);
    try {
      await videoApi.declineSession(call.sessionId);
    } catch {}
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setCall(null);
    setDeclining(false);
  }

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      right: 24,
      zIndex: 9999,
      background: "var(--surface, #fff)",
      border: "2px solid var(--brand-blue, #135bec)",
      borderRadius: 16,
      boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      padding: "20px 24px",
      minWidth: 300,
      maxWidth: 380,
      display: "flex",
      flexDirection: "column",
      gap: 14,
      animation: "slideInCall 0.3s ease",
    }}>
      <style>{`
        @keyframes slideInCall {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          background: "linear-gradient(135deg, #135bec, #0ea5e9)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, flexShrink: 0,
          animation: "pulse 1.2s ease-in-out infinite",
        }}>📞</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Incoming Call</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary, #666)", marginTop: 2 }}>
            {call.callerName}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={handleDecline}
          disabled={declining}
          style={{
            flex: 1, padding: "10px 0", borderRadius: 8,
            background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca",
            fontWeight: 600, fontSize: 14, cursor: "pointer",
          }}
        >
          {declining ? "…" : "✕ Decline"}
        </button>
        <button
          onClick={handleAccept}
          style={{
            flex: 1, padding: "10px 0", borderRadius: 8,
            background: "#16a34a", color: "#fff", border: "none",
            fontWeight: 600, fontSize: 14, cursor: "pointer",
          }}
        >
          ✓ Accept
        </button>
      </div>
    </div>
  );
}

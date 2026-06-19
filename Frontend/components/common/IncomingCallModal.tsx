"use client";
/**
 * components/common/IncomingCallModal.tsx
 * Global "incoming call" modal, rendered in the root layout so it works on any page.
 *
 * Delivery is made RELIABLE with two independent paths feeding the same modal:
 *   1. WebSocket "incoming_call" event  → instant delivery when the socket is healthy.
 *   2. Authoritative DB poll (every 3s) → GUARANTEED delivery even if the WebSocket
 *      event was missed (half-open socket, reconnect gap, server restart, etc.),
 *      because the call is persisted to the database the moment the session starts.
 *
 * Both paths are de-duplicated by session id, so the user rings exactly once per
 * call and never re-rings a call they already accepted, declined, or let time out.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWebSocket } from "@/lib/websocket-context";
import { useAuth } from "@/lib/auth";
import { videoApi } from "@/lib/api";

interface IncomingCall {
  sessionId: string;
  appointmentId: string;
  callerName: string;
}

const RING_TIMEOUT_MS = 60_000; // auto-dismiss a ringing call after 60s (missed)
const POLL_INTERVAL_MS = 3_000; // authoritative backstop poll cadence

export default function IncomingCallModal() {
  const { lastEvent } = useWebSocket();
  const { user } = useAuth();
  const router = useRouter();
  const [call, setCall] = useState<IncomingCall | null>(null);
  const [declining, setDeclining] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sessions already accepted / declined / missed — never ring for these again.
  const dismissedRef = useRef<Set<string>>(new Set());
  // The session currently ringing (ref mirror of `call`, readable inside intervals).
  const activeSessionRef = useRef<string | null>(null);

  const dismiss = useCallback((sessionId?: string) => {
    if (sessionId) dismissedRef.current.add(sessionId);
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    activeSessionRef.current = null;
    setCall(null);
  }, []);

  const presentCall = useCallback((next: IncomingCall) => {
    if (!next.sessionId || !next.appointmentId) return;
    if (dismissedRef.current.has(next.sessionId)) return;    // already handled
    if (activeSessionRef.current === next.sessionId) return; // already ringing this one
    activeSessionRef.current = next.sessionId;
    setCall(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => dismiss(next.sessionId), RING_TIMEOUT_MS);
  }, [dismiss]);

  // --- Path 1: WebSocket events (instant) ---
  useEffect(() => {
    if (!lastEvent || !user) return;
    if (lastEvent.type === "incoming_call") {
      presentCall({
        sessionId: lastEvent.session_id as string,
        appointmentId: lastEvent.appointment_id as string,
        callerName: (lastEvent.caller_name as string) || "Caller",
      });
    } else if (
      lastEvent.type === "call_declined" ||
      lastEvent.type === "call_missed" ||
      lastEvent.type === "call_ended"
    ) {
      const sid = lastEvent.session_id as string | undefined;
      if (!sid || sid === activeSessionRef.current) dismiss(sid);
    }
  }, [lastEvent, user, presentCall, dismiss]);

  // --- Path 2: authoritative DB poll (guaranteed) ---
  // Runs regardless of WebSocket state. The backend returns the active incoming
  // call for the logged-in user straight from the database, so the call is always
  // delivered within POLL_INTERVAL_MS even if the WebSocket dropped the event.
  useEffect(() => {
    if (!user || (user.role !== "patient" && user.role !== "dentist")) return;
    let stopped = false;
    let inFlight = false;

    const poll = async () => {
      if (stopped || inFlight || activeSessionRef.current) return;
      inFlight = true;
      try {
        const res = await videoApi.getIncomingCall();
        if (stopped || !res.has_call || !res.session_id || !res.appointment_id) return;
        presentCall({
          sessionId: res.session_id,
          appointmentId: res.appointment_id,
          callerName: res.caller_name || "Caller",
        });
      } catch {
        /* transient network error — retry on the next tick */
      } finally {
        inFlight = false;
      }
    };

    poll(); // check immediately on mount / login
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => { stopped = true; clearInterval(id); };
  }, [user, presentCall]);

  // Clean up the ring timer on unmount.
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  if (!call) return null;

  function handleAccept() {
    if (!call) return;
    const apptId = call.appointmentId;
    const sid = call.sessionId;
    dismiss(sid);
    // Stop the call ringing everywhere (this/other devices, and on refresh).
    videoApi.answerSession(sid).catch(() => {});
    const role = user?.role === "dentist" ? "dentist" : "patient";
    router.push(`/${role}/video?appointment_id=${apptId}`);
  }

  async function handleDecline() {
    if (!call) return;
    const sid = call.sessionId;
    setDeclining(true);
    try {
      await videoApi.declineSession(sid);
    } catch {}
    dismiss(sid);
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

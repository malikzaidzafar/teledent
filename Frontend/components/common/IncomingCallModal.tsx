"use client";
/**
 * components/common/IncomingCallModal.tsx
 * Global modal that appears when a WebSocket "incoming_call" event is received.
 * Rendered in the root layout so it works from any page.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWebSocket } from "@/lib/websocket-context";
import { useAuth } from "@/lib/auth";
import { videoApi } from "@/lib/api";

interface IncomingCall {
  sessionId: string;
  appointmentId: string;
  callerName: string;
}

export default function IncomingCallModal() {
  const { lastEvent } = useWebSocket();
  const { user } = useAuth();
  const router = useRouter();
  const [call, setCall] = useState<IncomingCall | null>(null);
  const [declining, setDeclining] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

"use client";
/**
 * VideoRoom.tsx — Custom LiveKit video room with modern 2-participant layout.
 *
 * Layout:
 *   - Remote participant fills the full call stage (no overlap).
 *   - Local participant rendered as a PiP tile in the corner.
 *   - Screen share removed.
 *   - Dentist gets a toggleable clinical notes side panel.
 *   - Custom control bar: mic / camera / notes (dentist) / end call.
 */

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  useRoomContext,
  ParticipantTile,
  PreJoin,
  type LocalUserChoices,
} from "@livekit/components-react";
import {
  Track,
  RoomEvent,
  ConnectionState,
  type RemoteParticipant,
} from "livekit-client";
import { useEffect, useState, useRef, useCallback } from "react";
import { videoApi } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VideoRoomProps {
  token: string;
  livekitUrl: string;
  roomName: string;
  displayName: string;
  role: "patient" | "dentist";
  sessionId: string;
  onDisconnected: (durationSeconds: number) => void;
  userChoices?: LocalUserChoices;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconMicOn() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
function IconMicOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
function IconCamOn() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}
function IconCamOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06A4 4 0 1 1 9.72 7.72" />
    </svg>
  );
}
function IconNotes() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}
function IconEndCall() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.26 12 19.79 19.79 0 0 1 1.19 3.37 2 2 0 0 1 3.16 1.2l3-.1a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.14 8.96a16 16 0 0 0 3.54 4.35z" />
    </svg>
  );
}

// ─── Control Button ───────────────────────────────────────────────────────────

function CtrlBtn({
  icon, label, active = true, danger = false, onClick,
}: {
  icon: React.ReactNode; label: string; active?: boolean; danger?: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const bg = danger
    ? hovered ? "#dc2626" : "#ef4444"
    : active
    ? hovered ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.13)"
    : hovered ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)";

  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 52, height: 52, borderRadius: "50%",
        border: danger ? "none" : `1px solid ${active ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.07)"}`,
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: bg,
        color: active || danger ? "#fff" : "#94a3b8",
        transition: "background 0.15s, transform 0.1s",
        transform: hovered ? "scale(1.07)" : "scale(1)",
        outline: "none", flexShrink: 0,
      }}
    >
      {icon}
    </button>
  );
}

// ─── Notes Panel ──────────────────────────────────────────────────────────────

function NotesPanel({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await videoApi.saveNotes(sessionId, text);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {}
    finally { setSaving(false); }
  }, [sessionId]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setNotes(e.target.value);
    setSaved(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(e.target.value), 1500);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (notes.trim()) persist(notes);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  return (
    <div style={{
      width: 300, flexShrink: 0,
      background: "#0f172a",
      borderLeft: "1px solid rgba(255,255,255,0.07)",
      display: "flex", flexDirection: "column",
      animation: "slideInPanel 0.2s ease",
    }}>
      <style>{`@keyframes slideInPanel { from { opacity:0; transform:translateX(12px); } to { opacity:1; transform:none; } }`}</style>
      <div style={{
        padding: "14px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: "#e2e8f0", letterSpacing: "0.01em" }}>Clinical Notes</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {saving && <span style={{ fontSize: 11, color: "#64748b" }}>Saving…</span>}
          {saved  && <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 500 }}>✓ Saved</span>}
          <button onClick={onClose} title="Close" style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#475569", fontSize: 16, padding: "2px 4px", lineHeight: 1, borderRadius: 4,
          }}>✕</button>
        </div>
      </div>
      <textarea
        style={{
          flex: 1, resize: "none", border: "none", outline: "none",
          background: "transparent", padding: "14px 16px",
          fontSize: 13, lineHeight: 1.75, color: "#cbd5e1", fontFamily: "inherit",
        }}
        placeholder={"Observations, symptoms, treatment plan…\n\nNotes auto-save as you type."}
        value={notes}
        onChange={handleChange}
      />
    </div>
  );
}

// ─── Room Inner ────────────────────────────────────────────────────────────────

interface RoomInnerProps {
  role: "patient" | "dentist";
  sessionId: string;
  startedAt: number;
  onDisconnected: (durationSeconds: number) => void;
}

function RoomInner({ role, sessionId, startedAt, onDisconnected }: RoomInnerProps) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Connecting);
  const [remoteLeft, setRemoteLeft] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  // Timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  function fmtTime(s: number) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  // Room events
  useEffect(() => {
    const onState = (s: ConnectionState) => setConnectionState(s);
    const onLeft  = (_p: RemoteParticipant) => { if (room.remoteParticipants.size === 0) setRemoteLeft(true); };
    const onDisc  = () => onDisconnected(Math.floor((Date.now() - startedAt) / 1000));
    room.on(RoomEvent.ConnectionStateChanged, onState);
    room.on(RoomEvent.ParticipantDisconnected, onLeft);
    room.on(RoomEvent.Disconnected, onDisc);
    return () => {
      room.off(RoomEvent.ConnectionStateChanged, onState);
      room.off(RoomEvent.ParticipantDisconnected, onLeft);
      room.off(RoomEvent.Disconnected, onDisc);
    };
  }, [room, startedAt, onDisconnected]);

  // Camera tracks ONLY — no screen share
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );

  const remoteTrack = tracks.find(t => !t.participant.isLocal);
  const localTrack  = tracks.find(t => t.participant.isLocal);
  const remoteName  = remoteTrack?.participant.name || remoteTrack?.participant.identity;

  async function toggleMic() {
    try { await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled); } catch {}
  }
  async function toggleCam() {
    try { await localParticipant.setCameraEnabled(!isCameraEnabled); } catch {}
  }
  async function handleLeave() {
    await room.disconnect();
    onDisconnected(Math.floor((Date.now() - startedAt) / 1000));
  }

  const isReconnecting = connectionState === ConnectionState.Reconnecting;
  const isConnected    = connectionState === ConnectionState.Connected;

  return (
    <div style={{
      display: "flex",
      height: "calc(100vh - 130px)",
      minHeight: 480,
      background: "#070d1a",
      borderRadius: 14,
      overflow: "hidden",
      boxShadow: "0 0 0 1px rgba(255,255,255,0.06)",
    }}>

      {/* ── Main stage ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>

        {/* Top status bar — overlaid on video */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
          padding: "14px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, transparent 100%)",
          pointerEvents: "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: isConnected ? "#22c55e" : isReconnecting ? "#f59e0b" : "#475569",
              boxShadow: isConnected ? "0 0 6px #22c55e" : "none",
              transition: "background 0.3s",
            }} />
            <span style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 600, letterSpacing: "0.01em" }}>
              {remoteName ?? "Waiting for participant…"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isReconnecting && (
              <span style={{
                fontSize: 11, color: "#f59e0b", fontWeight: 600,
                background: "rgba(245,158,11,0.15)", padding: "3px 9px", borderRadius: 20,
              }}>Reconnecting…</span>
            )}
            <span style={{
              fontFamily: "'SF Mono', 'Fira Mono', 'Consolas', monospace",
              fontSize: 13, color: "#94a3b8", fontWeight: 500,
              letterSpacing: "0.05em",
              background: "rgba(0,0,0,0.35)", padding: "3px 10px", borderRadius: 20,
            }}>
              {fmtTime(elapsed)}
            </span>
          </div>
        </div>

        {/* ── Video area ───────────────────────────────────────────────────── */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>

          {/* Remote — fills full stage */}
          {remoteTrack ? (
            <div style={{ position: "absolute", inset: 0 }}>
              <ParticipantTile
                trackRef={remoteTrack}
                style={{ width: "100%", height: "100%", borderRadius: 0 }}
              />
            </div>
          ) : (
            /* Waiting state — shown until remote joins */
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 16, background: "#070d1a",
            }}>
              <div style={{
                width: 80, height: 80, borderRadius: "50%",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <p style={{ color: "#475569", fontSize: 14, fontWeight: 500, margin: 0 }}>
                Waiting for the other participant…
              </p>
            </div>
          )}

          {/* Local — fills full stage when alone, PiP when remote is present */}
          {localTrack && !remoteTrack && (
            <div style={{ position: "absolute", inset: 0 }}>
              <ParticipantTile
                trackRef={localTrack}
                style={{ width: "100%", height: "100%", borderRadius: 0 }}
              />
            </div>
          )}
          {localTrack && remoteTrack && (
            <div style={{
              position: "absolute", bottom: 84, right: 16,
              width: 168, height: 112,
              borderRadius: 10, overflow: "hidden",
              border: "2px solid rgba(255,255,255,0.12)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
              zIndex: 15,
            }}>
              <ParticipantTile
                trackRef={localTrack}
                style={{ width: "100%", height: "100%", borderRadius: 0 }}
              />
            </div>
          )}

          {/* Remote left banner */}
          {remoteLeft && (
            <div style={{
              position: "absolute", top: 60, left: "50%", transform: "translateX(-50%)",
              background: "rgba(15,23,42,0.92)", border: "1px solid rgba(239,68,68,0.35)",
              color: "#fca5a5", borderRadius: 8, padding: "9px 18px",
              fontSize: 13, fontWeight: 600, zIndex: 25,
              backdropFilter: "blur(12px)", whiteSpace: "nowrap",
            }}>
              The other participant has left the call
            </div>
          )}
        </div>

        {/* ── Controls bar — overlaid at bottom ────────────────────────────── */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20,
          padding: "20px 20px 18px",
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 10,
          background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, transparent 100%)",
        }}>
          <CtrlBtn
            icon={isMicrophoneEnabled ? <IconMicOn /> : <IconMicOff />}
            label={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
            active={isMicrophoneEnabled}
            onClick={toggleMic}
          />
          <CtrlBtn
            icon={isCameraEnabled ? <IconCamOn /> : <IconCamOff />}
            label={isCameraEnabled ? "Turn off camera" : "Turn on camera"}
            active={isCameraEnabled}
            onClick={toggleCam}
          />
          {role === "dentist" && (
            <>
              <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.1)", margin: "0 2px" }} />
              <CtrlBtn
                icon={<IconNotes />}
                label={showNotes ? "Close notes" : "Clinical notes"}
                active={showNotes}
                onClick={() => setShowNotes(v => !v)}
              />
            </>
          )}
          <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.1)", margin: "0 2px" }} />
          <CtrlBtn icon={<IconEndCall />} label="End call" danger onClick={handleLeave} />
        </div>
      </div>

      {/* ── Notes panel (dentist only, toggleable) ───────────────────────────── */}
      {role === "dentist" && showNotes && (
        <NotesPanel sessionId={sessionId} onClose={() => setShowNotes(false)} />
      )}
    </div>
  );
}

// ─── VideoRoom (exported) ─────────────────────────────────────────────────────

export default function VideoRoom({
  token, livekitUrl, sessionId, role, onDisconnected, userChoices,
}: VideoRoomProps) {
  const startedAt = useRef(Date.now());
  const [currentToken, setCurrentToken] = useState(token);

  const videoOption = userChoices
    ? userChoices.videoEnabled ? (userChoices.videoDeviceId ? { deviceId: userChoices.videoDeviceId } : true) : false
    : true;
  const audioOption = userChoices
    ? userChoices.audioEnabled ? (userChoices.audioDeviceId ? { deviceId: userChoices.audioDeviceId } : true) : false
    : true;

  // Token refresh at 90 min
  useEffect(() => {
    const t = setTimeout(async () => {
      try { const d = await videoApi.getToken(sessionId); setCurrentToken(d.token); } catch {}
    }, 90 * 60 * 1000);
    return () => clearTimeout(t);
  }, [sessionId]);

  const handleDisconnected = useCallback((s: number) => onDisconnected(s), [onDisconnected]);

  return (
    <LiveKitRoom
      token={currentToken}
      serverUrl={livekitUrl}
      connect={true}
      video={videoOption}
      audio={audioOption}
      onDisconnected={() => handleDisconnected(Math.floor((Date.now() - startedAt.current) / 1000))}
      onError={(err) => console.error("LiveKitRoom error:", err)}
      style={{ height: "100%" }}
      data-lk-theme="default"
    >
      <RoomAudioRenderer />
      <RoomInner
        role={role}
        sessionId={sessionId}
        startedAt={startedAt.current}
        onDisconnected={handleDisconnected}
      />
    </LiveKitRoom>
  );
}

// ─── PreJoinScreen (exported) ─────────────────────────────────────────────────

interface PreJoinScreenProps {
  displayName: string;
  onJoin: (choices: LocalUserChoices) => void;
  onError?: (err: Error) => void;
}

export function PreJoinScreen({ displayName, onJoin, onError }: PreJoinScreenProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "62vh", gap: 28, padding: "32px 16px",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%", margin: "0 auto 16px",
          background: "linear-gradient(135deg, #1e40af, #0ea5e9)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
        }}>🎥</div>
        <div style={{ fontSize: 21, fontWeight: 800, marginBottom: 6, letterSpacing: "-0.02em" }}>
          Ready to join?
        </div>
        <div style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 360, margin: "0 auto" }}>
          Check your camera and microphone before entering the consultation.
        </div>
      </div>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 16, padding: 28, width: "100%", maxWidth: 540,
        boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
      }}>
        <PreJoin
          defaults={{ username: displayName, videoEnabled: true, audioEnabled: true }}
          onSubmit={onJoin}
          onError={onError}
          joinLabel="Join Consultation"
          micLabel="Microphone"
          camLabel="Camera"
          userLabel="Your name"
          persistUserChoices={true}
        />
      </div>
    </div>
  );
}
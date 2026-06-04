"use client";
/**
 * VideoRoom.tsx — Real LiveKit WebRTC video room component.
 *
 * Uses @livekit/components-react for:
 *   - LiveKitRoom  : manages the WebRTC connection lifecycle
 *   - RoomAudioRenderer : plays all remote audio tracks automatically
 *   - useTracks    : subscribes to camera + screen-share track references
 *   - ParticipantTile : renders a single participant's video feed
 *   - ControlBar   : mute / camera / screen-share / leave buttons wired to SDK
 *   - useRoomContext: access the underlying Room object for event handling
 *   - PreJoin      : camera/mic test screen shown before entering
 *
 * Both the patient and dentist pages import this component.
 */

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  ParticipantTile,
  ControlBar,
  useRoomContext,
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

export interface VideoRoomProps {
  /** LiveKit JWT token — obtained from POST /video/sessions/{id}/token */
  token: string;
  /** wss://... LiveKit server URL */
  livekitUrl: string;
  /** Room name (for display only) */
  roomName: string;
  /** Display name of the local participant */
  displayName: string;
  /** Role determines UI differences (screen share for dentist, notes panel) */
  role: "patient" | "dentist";
  /** Session ID — used to persist notes and end the session via REST */
  sessionId: string;
  /** Called when the local user disconnects or the room closes */
  onDisconnected: (durationSeconds: number) => void;
}

// ---------------------------------------------------------------------------
// VideoGrid — inner component rendered inside <LiveKitRoom>
// ---------------------------------------------------------------------------

function VideoGrid() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  return (
    <div className="lk-video-grid">
      {tracks.map((trackRef) => (
        <ParticipantTile
          key={`${trackRef.participant.identity}-${trackRef.source}`}
          trackRef={trackRef}
          style={{ borderRadius: "var(--radius-xl)", overflow: "hidden" }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NotesPanel — dentist-only clinical notes, auto-saved on blur
// ---------------------------------------------------------------------------

function NotesPanel({ sessionId }: { sessionId: string }) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setSaving(true);
      try {
        await videoApi.saveNotes(sessionId, text);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (e) {
        console.error("Failed to save notes:", e);
      } finally {
        setSaving(false);
      }
    },
    [sessionId],
  );

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setNotes(e.target.value);
    setSaved(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(e.target.value), 1500);
  }

  // Save on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (notes.trim()) persist(notes);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-xl)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid var(--border)",
          fontWeight: 700,
          fontSize: 13,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>📋 Clinical Notes</span>
        {saving && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Saving…</span>
        )}
        {saved && (
          <span style={{ fontSize: 11, color: "#16a34a" }}>✓ Saved</span>
        )}
      </div>
      <textarea
        className="input"
        style={{
          flex: 1,
          resize: "none",
          border: "none",
          borderRadius: 0,
          padding: 14,
          fontSize: 13,
          lineHeight: 1.6,
          minHeight: 200,
        }}
        placeholder="Enter clinical observations, symptoms, treatment recommendations…"
        value={notes}
        onChange={handleChange}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// RoomInner — rendered inside <LiveKitRoom>, has access to room context
// ---------------------------------------------------------------------------

interface RoomInnerProps {
  role: "patient" | "dentist";
  sessionId: string;
  startedAt: number;
  onDisconnected: (durationSeconds: number) => void;
}

function RoomInner({ role, sessionId, startedAt, onDisconnected }: RoomInnerProps) {
  const room = useRoomContext();
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Connecting,
  );
  const [remoteLeft, setRemoteLeft] = useState(false);

  useEffect(() => {
    // Track connection state for reconnection banner (H1)
    const handleStateChange = (state: ConnectionState) => setConnectionState(state);
    room.on(RoomEvent.ConnectionStateChanged, handleStateChange);

    // Detect when the remote party leaves (F2 — call-end sync)
    const handleParticipantDisconnected = (_participant: RemoteParticipant) => {
      if (room.remoteParticipants.size === 0) {
        setRemoteLeft(true);
      }
    };
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);

    // Room-level disconnect (network lost, room closed by server)
    const handleDisconnected = () => {
      const duration = Math.floor((Date.now() - startedAt) / 1000);
      onDisconnected(duration);
    };
    room.on(RoomEvent.Disconnected, handleDisconnected);

    return () => {
      room.off(RoomEvent.ConnectionStateChanged, handleStateChange);
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      room.off(RoomEvent.Disconnected, handleDisconnected);
    };
  }, [room, startedAt, onDisconnected]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 130px)",
        gap: 12,
      }}
    >
      {/* Reconnecting banner (H1) */}
      {connectionState === ConnectionState.Reconnecting && (
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            borderRadius: "var(--radius)",
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 600,
            color: "#b45309",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          ⚠️ Connection lost — attempting to reconnect…
        </div>
      )}

      {/* Remote party left banner (F2) */}
      {remoteLeft && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "var(--radius)",
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 600,
            color: "#dc2626",
          }}
        >
          📵 The other participant has left the call.
        </div>
      )}

      {/* Main video area + optional notes panel */}
      <div style={{ flex: 1, display: "flex", gap: 12, minHeight: 0 }}>
        {/* Video grid */}
        <div
          style={{
            flex: 1,
            background: "#0f172a",
            borderRadius: "var(--radius-xl)",
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          <VideoGrid />
        </div>

        {/* Dentist-only notes panel */}
        {role === "dentist" && <NotesPanel sessionId={sessionId} />}
      </div>

      {/* ControlBar — mute, camera, screen-share (dentist), leave */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          padding: "8px 16px",
        }}
      >
        <ControlBar
          controls={{
            microphone: true,
            camera: true,
            screenShare: role === "dentist",
            leave: true,
            chat: false,
          }}
          onDeviceError={(err) =>
            console.error("LiveKit device error:", err.source, err.error)
          }
          style={{ justifyContent: "center" }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VideoRoom — exported component used by patient & dentist pages
// ---------------------------------------------------------------------------

export default function VideoRoom({
  token,
  livekitUrl,
  roomName,
  displayName,
  role,
  sessionId,
  onDisconnected,
}: VideoRoomProps) {
  const startedAt = useRef(Date.now());

  const handleDisconnected = useCallback(
    (durationSeconds: number) => {
      onDisconnected(durationSeconds);
    },
    [onDisconnected],
  );

  return (
    <LiveKitRoom
      token={token}
      serverUrl={livekitUrl}
      connect={true}
      video={true}
      audio={true}
      screen={false}
      onDisconnected={() => {
        const duration = Math.floor((Date.now() - startedAt.current) / 1000);
        handleDisconnected(duration);
      }}
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

// ---------------------------------------------------------------------------
// PreJoinScreen — exported for use by both video pages
// ---------------------------------------------------------------------------

interface PreJoinScreenProps {
  displayName: string;
  onJoin: (choices: LocalUserChoices) => void;
  onError?: (err: Error) => void;
}

export function PreJoinScreen({ displayName, onJoin, onError }: PreJoinScreenProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: 24,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🎥</div>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
          Ready to join?
        </div>
        <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
          Test your camera and microphone before entering the consultation.
        </div>
      </div>
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          padding: 24,
          width: "100%",
          maxWidth: 560,
          boxShadow: "var(--shadow-sm)",
        }}
      >
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

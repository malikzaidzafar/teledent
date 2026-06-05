"use client";
/**
 * lib/websocket-context.tsx — Persistent WebSocket connection for real-time events.
 * Provides incoming call events, call declined events, and live message notifications.
 * Automatically reconnects on disconnect.
 */
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { tokenStore } from "./api";

export interface WSEvent {
  type: string;
  [key: string]: unknown;
}

interface WebSocketContextValue {
  lastEvent: WSEvent | null;
  isConnected: boolean;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  lastEvent: null,
  isConnected: false,
});

export function useWebSocket() {
  return useContext(WebSocketContext);
}

const WS_BASE = (() => {
  if (typeof window === "undefined") return "";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  // In development Next.js proxies /api → backend; WS needs to go directly
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  return apiBase.replace(/^https?:/, protocol);
})();

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    const token = tokenStore.getAccess();
    if (!token || unmountedRef.current) return;

    try {
      const ws = new WebSocket(`${WS_BASE}/ws/notifications?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!unmountedRef.current) setIsConnected(true);
      };

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as WSEvent;
          if (event.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
            return;
          }
          if (!unmountedRef.current) setLastEvent(event);
        } catch {}
      };

      ws.onclose = () => {
        if (!unmountedRef.current) {
          setIsConnected(false);
          // Reconnect after 3 seconds
          reconnectTimeout.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {}
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    // Only connect if user is logged in
    const token = tokenStore.getAccess();
    if (token) connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return (
    <WebSocketContext.Provider value={{ lastEvent, isConnected }}>
      {children}
    </WebSocketContext.Provider>
  );
}

"use client";
/**
 * lib/hooks/useScans.ts — Data hooks for scan-related API calls.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { scanApi, type Scan, type PaginatedResponse, type Analysis } from "../api";

export function useScans(patientId?: string) {
  const [data, setData] = useState<PaginatedResponse<Scan> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = patientId
        ? await import("../api").then(m => m.patientApi.scans(patientId, page))
        : await scanApi.list(page);
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load scans");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export function useScan(id: string) {
  const [data, setData] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    scanApi.get(id)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  return { data, loading, error };
}

/**
 * Poll scan analysis status every 2 seconds.
 * Calls onComplete(analysis) when status = "complete".
 * Calls onError(msg) when status = "failed" or timeout > 45s.
 * Returns a stop function to cancel polling.
 */
export function pollScanStatus(
  scanId: string,
  onComplete: (analysis: Analysis) => void,
  onError: (msg: string) => void,
): () => void {
  const INTERVAL_MS = 2000;
  const TIMEOUT_MS = 45000;
  const startedAt = Date.now();
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      if (Date.now() - startedAt > TIMEOUT_MS) {
        onError("timeout");
        return;
      }
      const { status } = await scanApi.analysisStatus(scanId);
      if (status === "complete") {
        const analysis = await scanApi.analysis(scanId);
        onComplete(analysis);
        return;
      }
      if (status === "failed") {
        onError("Analysis failed. Please try again.");
        return;
      }
      // Still processing — schedule next tick
      setTimeout(tick, INTERVAL_MS);
    } catch {
      if (!stopped) setTimeout(tick, INTERVAL_MS);
    }
  };

  setTimeout(tick, INTERVAL_MS);
  return () => { stopped = true; };
}

/** React hook wrapper around pollScanStatus */
export function useScanPolling(scanId: string | null) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!scanId) return;
    setAnalysis(null);
    setPollError(null);
    setDone(false);

    stopRef.current = pollScanStatus(
      scanId,
      (a) => { setAnalysis(a); setDone(true); },
      (msg) => { setPollError(msg); setDone(true); },
    );
    return () => stopRef.current?.();
  }, [scanId]);

  return { analysis, pollError, done };
}

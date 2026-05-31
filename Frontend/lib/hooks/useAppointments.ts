"use client";
/**
 * lib/hooks/useAppointments.ts — Appointment data hooks.
 */
import { useState, useEffect, useCallback } from "react";
import { appointmentApi, type Appointment, type PaginatedResponse } from "../api";

export function useAppointments(patientId?: string) {
  const [data, setData] = useState<PaginatedResponse<Appointment> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = patientId
        ? await import("../api").then(m => m.patientApi.appointments(patientId))
        : await appointmentApi.list();
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export function useAppointment(id: string) {
  const [data, setData] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    appointmentApi.get(id)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  return { data, loading, error };
}

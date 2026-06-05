"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader, Avatar } from "@/components/ui/shared";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth";
import { dentistApi, appointmentApi, reportApi, type DentistSummary, type Report } from "@/lib/api";
import { useEffect, useState, Suspense, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function BookAppointmentPageInner() {
  useRequireAuth("patient");
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledScanId = searchParams.get("scan_id") || undefined;

  const [dentists, setDentists] = useState<DentistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [booking, setBooking] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Date picker state — default to today
  const todayStr = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Real slots from backend: dentistId → string[] of ISO slot strings
  const [slotsMap, setSlotsMap] = useState<Record<string, string[]>>({});
  const [slotsLoading, setSlotsLoading] = useState<Record<string, boolean>>({});

  // Report sharing state
  const [myReports, setMyReports] = useState<Report[]>([]);
  const [selectedReports, setSelectedReports] = useState<Record<string, string[]>>({}); // dentistId → reportIds

  useEffect(() => {
    dentistApi.list({ limit: 20 })
      .then(res => setDentists(res.data))
      .catch(() => setDentists([]))
      .finally(() => setLoading(false));
    reportApi.list(1).then(res => setMyReports(res.data)).catch(() => {});
  }, []);

  const filtered = dentists.filter(d =>
    !search || d.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const fetchSlots = useCallback(async (dentistId: string, date: string, retries = 2) => {
    setSlotsLoading(prev => ({ ...prev, [dentistId]: true }));
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await dentistApi.availableSlots(dentistId, date);
        setSlotsMap(prev => ({ ...prev, [dentistId]: res.slots }));
        setSlotsLoading(prev => ({ ...prev, [dentistId]: false }));
        return;
      } catch {
        if (attempt === retries) {
          setSlotsMap(prev => ({ ...prev, [dentistId]: [] }));
          setSlotsLoading(prev => ({ ...prev, [dentistId]: false }));
        } else {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    }
  }, []);

  // Debounce slot fetch on date/filter changes — only fetch visible dentists
  useEffect(() => {
    if (filtered.length === 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSelectedSlot({});
      filtered.forEach(d => fetchSlots(d.id, selectedDate));
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length, selectedDate]);

  function toggleReport(dentistId: string, reportId: string) {
    setSelectedReports(prev => {
      const current = prev[dentistId] || [];
      const next = current.includes(reportId)
        ? current.filter(id => id !== reportId)
        : [...current, reportId];
      return { ...prev, [dentistId]: next };
    });
  }

  async function handleBook(dentist: DentistSummary) {
    const slot = selectedSlot[dentist.id];
    if (!slot) { setError("Please select a time slot first."); return; }
    setError(null);
    setBooking(dentist.id);
    try {
      const appt = await appointmentApi.create({
        dentist_id: dentist.id,
        scheduled_at: slot,
        duration_min: 30,
        type: "Video Consultation",
        scan_id: prefilledScanId,
        report_ids: selectedReports[dentist.id] || [],
      });
      // Redirect to Stripe checkout for payment
      router.push(`/patient/checkout?appointment_id=${appt.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Booking failed. Please try again.");
    } finally {
      setBooking(null);
    }
  }

  function fmtSlot(iso: string) {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <AppLayout role="patient" pageTitle="Book Appointment">
      <PageHeader title="Book Appointment" />
      <div className="page-body">
        {prefilledScanId && (
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 20, fontSize: 14 }}>
            Booking linked to your scan — your dentist will receive access to your AI analysis report.
          </div>
        )}
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 20, fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Controls: search + date picker */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="Search dentists..."
            style={{ flex: 1, minWidth: 180 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
              Pick a date:
            </label>
            <input
              type="date"
              className="input"
              style={{ width: 160 }}
              min={todayStr}
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading dentists…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No dentists found.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {filtered.map((d) => {
              const slots = slotsMap[d.id] ?? [];
              const loadingSlots = slotsLoading[d.id] ?? false;
              const dentistSelectedReports = selectedReports[d.id] || [];
              return (
                <div key={d.id} className="card">
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 24, alignItems: "start" }}>
                    <Avatar name={d.full_name} size={56} />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <h3 style={{ fontSize: 17, fontWeight: 700 }}>{d.full_name}</h3>
                      </div>
                      {d.rating && (
                        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
                          <span style={{ color: "#d97706", fontWeight: 700 }}>{d.rating} ★</span>
                        </div>
                      )}

                      {/* Slots */}
                      {loadingSlots ? (
                        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>Loading available slots…</div>
                      ) : slots.length === 0 ? (
                        <div style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--surface-2)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
                          No available slots on {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}.
                          Try a different date.
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Available slots — {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {slots.map((slot) => (
                              <button
                                key={slot}
                                className={`btn btn-sm ${selectedSlot[d.id] === slot ? "btn-primary" : "btn-ghost"}`}
                                style={{ fontSize: 12, minWidth: 70 }}
                                onClick={() => setSelectedSlot(prev => ({ ...prev, [d.id]: slot }))}
                              >
                                {fmtSlot(slot)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Share Reports section */}
                      {myReports.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Share Reports with Dentist (optional)
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {myReports.slice(0, 5).map(r => (
                              <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                                <input
                                  type="checkbox"
                                  checked={dentistSelectedReports.includes(r.id)}
                                  onChange={() => toggleReport(d.id, r.id)}
                                  style={{ accentColor: "var(--brand-blue)" }}
                                />
                                <span style={{ fontWeight: 500 }}>{r.final_diagnosis}</span>
                                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                                  {new Date(r.created_at).toLocaleDateString()}
                                </span>
                              </label>
                            ))}
                            {dentistSelectedReports.length > 0 && (
                              <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 600, marginTop: 2 }}>
                                ✓ {dentistSelectedReports.length} report{dentistSelectedReports.length > 1 ? "s" : ""} will be shared
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 140 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleBook(d)}
                        disabled={booking === d.id || !selectedSlot[d.id]}
                      >
                        {booking === d.id ? "Booking…" : "Confirm Booking"}
                      </button>
                      <Link href={`/dentist/profile?id=${d.id}`} className="btn btn-ghost btn-sm">View Profile</Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default function BookAppointmentPage() {
  return (
    <Suspense>
      <BookAppointmentPageInner />
    </Suspense>
  );
}

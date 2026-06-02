"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader, Avatar } from "@/components/ui/shared";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth";
import { dentistApi, appointmentApi, type DentistSummary } from "@/lib/api";
import { useEffect, useState, Suspense } from "react";
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

  useEffect(() => {
    dentistApi.list({ limit: 20 })
      .then(res => setDentists(res.data))
      .catch(() => setDentists([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = dentists.filter(d =>
    !search || d.full_name.toLowerCase().includes(search.toLowerCase())
  );

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
      });
      // Redirect to Stripe checkout for payment
      router.push(`/patient/checkout?appointment_id=${appt.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Booking failed. Please try again.");
    } finally {
      setBooking(null);
    }
  }

  // Generate quick time slots for today + tomorrow
  function getSlots(dentistId: string): string[] {
    const base = new Date();
    base.setMinutes(0, 0, 0);
    const slots: string[] = [];
    for (let h = 9; h <= 16; h += 2) {
      const d = new Date(base);
      d.setHours(h);
      slots.push(d.toISOString());
    }
    return slots;
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

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading dentists…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No dentists found.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {filtered.map((d) => {
              const slots = getSlots(d.id);
              return (
                <div key={d.id} className="card" style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 24, alignItems: "center" }}>
                  <Avatar name={d.full_name} size={56} />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <h3 style={{ fontSize: 17, fontWeight: 700 }}>{d.full_name}</h3>

                    </div>
                    {d.rating && (
                      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                        <span style={{ color: "#d97706", fontWeight: 700 }}> {d.rating}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {slots.map((slot) => (
                        <button
                          key={slot}
                          className={`btn btn-sm ${selectedSlot[d.id] === slot ? "btn-primary" : "btn-ghost"}`}
                          style={{ fontSize: 12 }}
                          onClick={() => setSelectedSlot(prev => ({ ...prev, [d.id]: slot }))}
                        >
                          {new Date(slot).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </button>
                      ))}
                    </div>
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

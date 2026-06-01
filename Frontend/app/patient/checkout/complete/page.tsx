"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/common/AppLayout";
import { SectionCard } from "@/components/ui/shared";
import { paymentApi } from "@/lib/api";

function CompleteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appointmentId = searchParams.get("appointment_id") ?? "";
  const clientSecret = searchParams.get("payment_intent_client_secret") ?? "";
  const [status, setStatus] = useState<"loading" | "success" | "failed">("loading");

  useEffect(() => {
    if (!appointmentId || !clientSecret) {
      setStatus("failed");
      return;
    }
    // Check status via backend (most reliable)
    paymentApi.getStatus(appointmentId).then((d) => {
      setStatus(d.status === "succeeded" ? "success" : "failed");
    }).catch(() => setStatus("failed"));
  }, [appointmentId, clientSecret]);

  return (
    <AppLayout role="patient" pageTitle="Payment Complete">
      <div className="page-body">
        <div style={{ maxWidth: 480, margin: "60px auto" }}>
          <SectionCard title="">
            {status === "loading" && (
              <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
                Verifying payment…
              </div>
            )}
            {status === "success" && (
              <div style={{ textAlign: "center", padding: "48px 24px" }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
                <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Payment Confirmed!</h2>
                <p style={{ color: "var(--text-secondary)", marginBottom: 28 }}>
                  Your appointment is booked and payment received.
                </p>
                <button className="btn btn-primary" onClick={() => router.push("/patient/appointments")}>
                  View My Appointments →
                </button>
              </div>
            )}
            {status === "failed" && (
              <div style={{ textAlign: "center", padding: "48px 24px" }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>❌</div>
                <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Payment Failed</h2>
                <p style={{ color: "var(--text-secondary)", marginBottom: 28 }}>
                  Something went wrong. Please try again.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => router.push(`/patient/checkout?appointment_id=${appointmentId}`)}
                >
                  Try Again
                </button>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </AppLayout>
  );
}

export default function CompletePage() {
  return <Suspense><CompleteInner /></Suspense>;
}

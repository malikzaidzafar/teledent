"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/common/AppLayout";
import { SectionCard } from "@/components/ui/shared";
import { paymentApi, appointmentApi, messagesApi } from "@/lib/api";

function CompleteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appointmentId = searchParams.get("appointment_id") ?? "";
  const clientSecret = searchParams.get("payment_intent_client_secret") ?? "";
  const [status, setStatus] = useState<"loading" | "success" | "failed">("loading");
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!appointmentId || !clientSecret) {
      setStatus("failed");
      return;
    }
    paymentApi.getStatus(appointmentId).then((d) => {
      setStatus(d.status === "succeeded" ? "success" : "failed");
    }).catch(() => setStatus("failed"));
  }, [appointmentId, clientSecret]);

  async function handleGoToMessages() {
    setRedirecting(true);
    try {
      const appt = await appointmentApi.get(appointmentId);
      const dentistUserId = appt.dentist_user_id;
      if (dentistUserId) {
        const conv = await messagesApi.startConversation(dentistUserId);
        router.push(`/patient/messages?conv=${conv.id}`);
      } else {
        router.push("/patient/appointments");
      }
    } catch {
      router.push("/patient/appointments");
    }
  }

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
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 32 }}>✓</div>
                <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Payment Confirmed!</h2>
                <p style={{ color: "var(--text-secondary)", marginBottom: 8 }}>
                  Your appointment is booked and payment received. Your dentist has been notified.
                </p>
                {redirecting ? (
                  <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>Opening your conversation with your dentist…</p>
                ) : (
                  <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>You can now message your dentist directly.</p>
                )}
                <button
                  className="btn btn-primary"
                  onClick={handleGoToMessages}
                  disabled={redirecting}
                >
                  {redirecting ? "Opening messages…" : "Go to Messages →"}
                </button>
              </div>
            )}
            {status === "failed" && (
              <div style={{ textAlign: "center", padding: "48px 24px" }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#fee2e2", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 32 }}>✕</div>
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

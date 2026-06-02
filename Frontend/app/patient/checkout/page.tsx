"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader, SectionCard } from "@/components/ui/shared";
import { useRequireAuth } from "@/lib/auth";
import { paymentApi, type PaymentIntent } from "@/lib/api";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

// ---------------------------------------------------------------------------
// Inner checkout form — rendered inside <Elements>
// ---------------------------------------------------------------------------
function CheckoutForm({
  appointmentId,
  amountCents,
  currency,
  onSuccess,
}: {
  appointmentId: string;
  amountCents: number;
  currency: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setErrorMsg(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // Stripe redirects here after 3-D Secure; we handle it in the return_url page
        return_url: `${window.location.origin}/patient/checkout/complete?appointment_id=${appointmentId}`,
      },
      // Prevent redirect for cards that don't need 3DS
      redirect: "if_required",
    });

    if (error) {
      setErrorMsg(error.message ?? "Payment failed. Please try again.");
      setProcessing(false);
    } else {
      // Payment succeeded without redirect
      onSuccess();
    }
  }

  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  });

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Order summary */}
      <div style={{
        background: "var(--bg-secondary)",
        borderRadius: "var(--radius)",
        padding: "16px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Video Consultation</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
            30-minute dental consultation
          </div>
        </div>
        <div style={{ fontWeight: 800, fontSize: 20, color: "var(--brand-blue)" }}>
          {fmt.format(amountCents / 100)}
        </div>
      </div>

      {/* Test-mode notice */}
      <div style={{
        background: "#fffbeb",
        border: "1px solid #fde68a",
        borderRadius: "var(--radius)",
        padding: "10px 14px",
        fontSize: 13,
        color: "#92400e",
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
      }}>
        <span style={{ fontSize: 16 }}></span>
        <div>
          <strong>Test Mode — </strong>no real charge.
          Use card <code style={{ background: "#fef3c7", padding: "1px 5px", borderRadius: 4 }}>4242 4242 4242 4242</code>,
          any future date &amp; any 3-digit CVC.
        </div>
      </div>

      {/* Stripe Payment Element */}
      <div style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "16px",
        background: "#fff",
      }}>
        <PaymentElement options={{ layout: "tabs" }} />
      </div>

      {errorMsg && (
        <div style={{
          background: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#dc2626",
          borderRadius: "var(--radius)",
          padding: "10px 14px",
          fontSize: 14,
        }}>
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={!stripe || !elements || processing}
        style={{ height: 48, fontSize: 16, fontWeight: 700 }}
      >
        {processing ? (
          <span style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
            <span className="spinner" style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
            Processing…
          </span>
        ) : (
          `Pay ${fmt.format(amountCents / 100)}`
        )}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Success screen
// ---------------------------------------------------------------------------
function PaymentSuccess({ onDone }: { onDone: () => void }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px" }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 32 }}>✓</div>
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Payment Successful!</h2>
      <p style={{ color: "var(--text-secondary)", marginBottom: 28, fontSize: 15 }}>
        Your appointment has been confirmed. You'll receive a confirmation shortly.
      </p>
      <button className="btn btn-primary" onClick={onDone}>
        View My Appointments →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page logic
// ---------------------------------------------------------------------------
function CheckoutPageInner() {
  useRequireAuth("patient");
  const router = useRouter();
  const searchParams = useSearchParams();
  const appointmentId = searchParams.get("appointment_id") ?? "";

  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const init = useCallback(async () => {
    if (!appointmentId) {
      setError("No appointment specified.");
      setLoading(false);
      return;
    }
    try {
      const data = await paymentApi.createIntent(appointmentId);
      setIntent(data);
      if (data.publishable_key && !data.publishable_key.includes("REPLACE")) {
        setStripePromise(loadStripe(data.publishable_key));
      } else {
        setError(
          "Stripe is not configured yet. Add your test keys to Backend/.env:\n" +
          "STRIPE_SECRET_KEY=sk_test_...\nSTRIPE_PUBLISHABLE_KEY=pk_test_..."
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not initialise payment.");
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => { init(); }, [init]);

  if (!appointmentId) {
    return (
      <AppLayout role="patient" pageTitle="Checkout">
        <div style={{ padding: 40, textAlign: "center", color: "#dc2626" }}>
          No appointment ID provided.{" "}
          <button className="btn btn-ghost btn-sm" onClick={() => router.back()}>Go back</button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout role="patient" pageTitle="Checkout">
      <PageHeader
        title="Complete Payment"
        subtitle="Secure payment powered by Stripe"
      />
      <div className="page-body">
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          {loading && (
            <SectionCard title="">
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                Preparing secure checkout…
              </div>
            </SectionCard>
          )}

          {!loading && error && (
            <SectionCard title="Payment Setup">
              <div style={{
                padding: "20px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "var(--radius)",
                color: "#dc2626",
                whiteSpace: "pre-line",
                fontSize: 14,
                lineHeight: 1.6,
              }}>
                {error}
              </div>
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => router.back()}>
                  ← Go Back
                </button>
              </div>
            </SectionCard>
          )}

          {!loading && !error && paid && (
            <SectionCard title="">
              <PaymentSuccess onDone={() => router.push("/patient/appointments")} />
            </SectionCard>
          )}

          {!loading && !error && !paid && intent && stripePromise && (
            <SectionCard title="Payment Details">
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret: intent.client_secret ?? undefined,
                  appearance: {
                    theme: "stripe",
                    variables: {
                      colorPrimary: "#2563eb",
                      borderRadius: "8px",
                      fontFamily: "Inter, system-ui, sans-serif",
                    },
                  },
                }}
              >
                <CheckoutForm
                  appointmentId={appointmentId}
                  amountCents={intent.amount_cents}
                  currency={intent.currency}
                  onSuccess={() => setPaid(true)}
                />
              </Elements>
            </SectionCard>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutPageInner />
    </Suspense>
  );
}

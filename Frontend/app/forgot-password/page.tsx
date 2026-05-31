"use client";
import AuthShell from "@/components/common/AuthShell";
import Link from "next/link";
import { useState, FormEvent } from "react";
import { authApi } from "@/lib/api";

const PANEL_POINTS = [
  { icon: "", label: "Your account remains fully secure" },
  { icon: "", label: "Reset link sent within 60 seconds" },
  { icon: "", label: "HIPAA-compliant security protocols" },
];

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      panelHeading="Account Security You Can Trust"
      panelBody="We take data security seriously. Your dental health records are always protected."
      panelPoints={PANEL_POINTS}
    >
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", marginBottom: 32, width: "fit-content" }}>
        <span style={{ fontSize: 14, color: "var(--text-secondary)" }}> Back to Home</span>
      </Link>

      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 8 }}>Reset Your Password</h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 32, lineHeight: 1.6 }}>
        Enter the email address linked to your account and we'll send you a secure reset link.
      </p>

      {sent ? (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#16a34a", borderRadius: "var(--radius)", padding: "14px 18px", fontSize: 14, lineHeight: 1.6 }}>
           If this email exists in our system, a password reset link has been sent. Please check your inbox.
        </div>
      ) : (
        <>
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 20, fontSize: 14 }}>
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <label className="label" htmlFor="reset-email">Email Address</label>
              <input id="reset-email" type="text" className="input" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <button id="reset-submit" type="submit" className="btn btn-primary" style={{ padding: "13px 20px", fontSize: 15 }} disabled={loading}>
              {loading ? "Sending…" : "Send Reset Link "}
            </button>
          </form>
        </>
      )}

      <div className="divider" />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
        <Link href="/login" style={{ color: "var(--brand-blue)", fontWeight: 600, textDecoration: "none" }}> Back to Login</Link>
        <Link href="/signup" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>Create Account</Link>
      </div>
    </AuthShell>
  );
}

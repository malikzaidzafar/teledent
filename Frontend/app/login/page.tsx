"use client";
import AuthShell from "@/components/common/AuthShell";
import GoogleSignInButton from "@/components/common/GoogleSignInButton";
import Link from "next/link";
import { useState, FormEvent } from "react";
import { useAuth } from "@/lib/auth";

const PANEL_POINTS = [
  { icon: "", label: "AI scan results in under 2 minutes" },
  { icon: "", label: "HIPAA-compliant & fully encrypted" },
  { icon: "", label: "HD video consultations with dentists" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) { setError("Please enter a valid email address."); return; }
    if (!password) { setError("Please enter your password."); return; }
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      panelHeading="AI-Powered Diagnostics at Your Fingertips"
      panelBody="Experience the future of dental care with our advanced screening technology. Secure, fast, and accurate."
      panelPoints={PANEL_POINTS}
    >
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 8 }}>Welcome Back</h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 32 }}>Securely access your dental portal</p>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 20, fontSize: 14 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label className="label" htmlFor="email">Email Address</label>
          <input id="email" type="text" className="input" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <label className="label" htmlFor="password" style={{ margin: 0 }}>Password</label>
            <Link href="/forgot-password" style={{ fontSize: 13, color: "var(--brand-blue)", textDecoration: "none", fontWeight: 500 }}>Forgot Password?</Link>
          </div>
          <input id="password" type="password" className="input" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <button id="login-submit" type="submit" className="btn btn-primary" style={{ padding: "13px 20px", fontSize: 15 }} disabled={loading}>
          {loading ? "Signing in…" : "Sign In "}
        </button>
      </form>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
        <hr style={{ flex: 1, border: "none", borderTop: "1px solid var(--border-color, #e2e8f0)" }} />
        <span style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>or</span>
        <hr style={{ flex: 1, border: "none", borderTop: "1px solid var(--border-color, #e2e8f0)" }} />
      </div>
      <GoogleSignInButton />

      <div className="divider" />
      <p style={{ fontSize: 14, color: "var(--text-secondary)", textAlign: "center" }}>
        New to Teledent?{" "}
        <Link href="/signup" style={{ color: "var(--brand-blue)", fontWeight: 600, textDecoration: "none" }}>Register here</Link>
      </p>
    </AuthShell>
  );
}

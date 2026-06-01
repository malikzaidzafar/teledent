"use client";
import AuthShell from "@/components/common/AuthShell";
import GoogleSignInButton from "@/components/common/GoogleSignInButton";
import Link from "next/link";
import { useState, FormEvent } from "react";
import { useAuth } from "@/lib/auth";

const PANEL_POINTS = [
  { icon: "", label: "Free account, no credit card required" },
  { icon: "", label: "Instant AI dental screening" },
  { icon: "", label: "Your data is always encrypted & private" },
];

export default function SignupPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", password: "", role: "" });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agreed) { setError("You must agree to the Terms of Service."); return; }
    if (!form.role) { setError("Please select your role."); return; }
    setError(null);
    setLoading(true);
    try {
      await register(form);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      panelHeading="Start Your Dental Health Journey Today"
      panelBody="Join thousands of patients getting smarter, faster dental care with AI-powered screening."
      panelPoints={PANEL_POINTS}
    >
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 8 }}>Create Your Account</h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 32 }}>Get started for free — no credit card needed</p>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 20, fontSize: 14 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label className="label" htmlFor="first-name">First Name</label>
            <input id="first-name" type="text" className="input" placeholder="Sarah" value={form.first_name} onChange={e => update("first_name", e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="last-name">Last Name</label>
            <input id="last-name" type="text" className="input" placeholder="Johnson" value={form.last_name} onChange={e => update("last_name", e.target.value)} required />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="signup-email">Email Address</label>
          <input id="signup-email" type="text" className="input" placeholder="you@example.com" value={form.email} onChange={e => update("email", e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="signup-password">Password</label>
          <input id="signup-password" type="password" className="input" placeholder="At least 8 characters" value={form.password} onChange={e => update("password", e.target.value)} required minLength={8} />
        </div>
        <div>
          <label className="label" htmlFor="role">I am a…</label>
          <select id="role" className="input" style={{ cursor: "pointer" }} value={form.role} onChange={e => update("role", e.target.value)} required>
            <option value="">Select your role</option>
            <option value="patient">Patient</option>
            <option value="dentist">Dentist</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 4 }}>
          <input id="terms" type="checkbox" style={{ width: 16, height: 16, accentColor: "var(--brand-blue)", marginTop: 1 }} checked={agreed} onChange={e => setAgreed(e.target.checked)} />
          <label htmlFor="terms" style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            I agree to the{" "}
            <Link href="/terms" style={{ color: "var(--brand-blue)", textDecoration: "none" }}>Terms of Service</Link>
            {" "}and{" "}
            <Link href="/privacy" style={{ color: "var(--brand-blue)", textDecoration: "none" }}>Privacy Policy</Link>
          </label>
        </div>
        <button id="signup-submit" type="submit" className="btn btn-primary" style={{ padding: "13px 20px", fontSize: 15 }} disabled={loading}>
          {loading ? "Creating account…" : "Create Account "}
        </button>
      </form>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
        <hr style={{ flex: 1, border: "none", borderTop: "1px solid var(--border-color, #e2e8f0)" }} />
        <span style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>or sign up with</span>
        <hr style={{ flex: 1, border: "none", borderTop: "1px solid var(--border-color, #e2e8f0)" }} />
      </div>
      <GoogleSignInButton role={form.role || "patient"} />

      <div className="divider" />
      <p style={{ fontSize: 14, color: "var(--text-secondary)", textAlign: "center" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "var(--brand-blue)", fontWeight: 600, textDecoration: "none" }}>Log in</Link>
      </p>
    </AuthShell>
  );
}

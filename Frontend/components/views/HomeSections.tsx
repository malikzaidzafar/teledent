import { FEATURES, STEPS, STATS, DENTIST_PERKS, DENTIST_NOTIFICATIONS } from "@/lib/homepage-data";
import Link from "next/link";

export function HeroSection() {
  return (
    <section style={{ background: "linear-gradient(160deg,#f0f5ff 0%,#fff 60%,#f8fafc 100%)", padding: "100px 32px 80px", textAlign: "center", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -80, right: -80, width: 400, height: 400, borderRadius: "50%", background: "rgba(19,91,236,0.05)", pointerEvents: "none" }} />
      <div style={{ maxWidth: 760, margin: "0 auto", position: "relative" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--brand-blue-light)", color: "var(--brand-blue)", borderRadius: 999, padding: "6px 16px", fontSize: 13, fontWeight: 600, marginBottom: 28 }}>
           Trusted by 10,000+ patients
        </div>
        <h1 style={{ fontSize: "clamp(38px,5.5vw,62px)", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1.08, marginBottom: 24 }}>
          AI-Powered Dental Screening{" "}
          <span style={{ color: "var(--brand-blue)" }}>&amp; Live Consultation</span>
        </h1>
        <p style={{ fontSize: 17, color: "var(--text-secondary)", lineHeight: 1.75, maxWidth: 580, margin: "0 auto 36px" }}>
          Get an instant preliminary diagnosis or connect with a certified dentist for a live video consultation from the comfort of your home.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginBottom: 56 }}>
          <Link href="/signup" className="btn btn-primary btn-lg">Get Started Free </Link>
          <Link href="#how-it-works" className="btn btn-ghost btn-lg">See How It Works</Link>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 14, background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "16px 24px", boxShadow: "var(--shadow-md)" }}>
          <div style={{ width: 44, height: 44, borderRadius: "var(--radius)", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}></div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Analysis Complete</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>No cavities detected</div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function StatsBanner() {
  return (
    <section style={{ background: "var(--brand-blue)", padding: "48px 32px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 32, textAlign: "center" }}>
        {STATS.map((s) => (
          <div key={s.label}>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#fff", letterSpacing: "-0.04em" }}>{s.value}</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", marginTop: 4, fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FeaturesSection() {
  return (
    <section id="features" style={{ padding: "96px 32px", background: "var(--surface)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}>Advanced Dental Care</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 16, marginTop: 12, maxWidth: 500, margin: "12px auto 0" }}>
            Experience the future of dentistry with features designed for your convenience and health.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 24 }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="card card-hover" style={{ padding: 32 }}>
              <div style={{ width: 52, height: 52, borderRadius: "var(--radius-lg)", background: f.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 18 }}>{f.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowItWorksSection() {
  return (
    <section id="how-it-works" style={{ padding: "96px 32px", background: "var(--surface-2)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}>How Teledent AI Works</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 16, marginTop: 12, maxWidth: 500, margin: "12px auto 0" }}>
            Get a professional dental assessment in four simple steps.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 24 }}>
          {STEPS.map((s) => (
            <div key={s.step} className="card" style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--brand-blue)", letterSpacing: "0.06em", marginBottom: 14 }}>STEP {s.step}</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{s.title}</h3>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ForDentistsSection() {
  return (
    <section id="for-dentists" style={{ padding: "96px 32px", background: "var(--surface)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
        <div>
          <div className="badge badge-blue" style={{ marginBottom: 20 }}>For Dental Professionals</div>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 18, lineHeight: 1.2 }}>Join 500+ Dentists Already on the Platform</h2>
          <p style={{ color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 28 }}>Review AI-screened cases, provide expert diagnoses, and conduct live video consultations — all from one secure dashboard.</p>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
            {DENTIST_PERKS.map((p) => (
              <li key={p} style={{ display: "flex", gap: 10, fontSize: 14, color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--success)", fontWeight: 700, flexShrink: 0 }}></span>{p}
              </li>
            ))}
          </ul>
          <Link href="/signup" className="btn btn-primary">Register as a Dentist </Link>
        </div>
        <div style={{ background: "linear-gradient(135deg,var(--brand-blue-light) 0%,#dbeafe 100%)", borderRadius: "var(--radius-xl)", padding: 40, display: "flex", flexDirection: "column", gap: 14 }}>
          {DENTIST_NOTIFICATIONS.map((n) => (
            <div key={n.label} style={{ background: "#fff", borderRadius: "var(--radius)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "var(--shadow-sm)" }}>
              <span style={{ fontSize: 22 }}>{n.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{n.label}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{n.sub}</div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{n.time}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CtaSection() {
  return (
    <section style={{ background: "linear-gradient(135deg,#0b3fba 0%,#135bec 100%)", padding: "80px 32px", textAlign: "center" }}>
      <div style={{ maxWidth: 580, margin: "0 auto" }}>
        <h2 style={{ fontSize: 34, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 14 }}>Ready to Transform Your Dental Care?</h2>
        <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 16, marginBottom: 36, lineHeight: 1.7 }}>Join thousands of patients and dentists already using Teledent AI.</p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
          <Link href="/signup" className="btn btn-lg" style={{ background: "#fff", color: "var(--brand-blue)", fontWeight: 700 }}>Start for Free </Link>
          <Link href="/login" className="btn btn-lg" style={{ border: "1.5px solid rgba(255,255,255,0.4)", color: "#fff", background: "transparent" }}>Log In</Link>
        </div>
      </div>
    </section>
  );
}

export function PageFooter() {
  return (
    <footer style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", padding: "28px 32px", textAlign: "center" }}>
      <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
        © 2024 Teledent AI. All rights reserved.{" · "}
        <Link href="/privacy" style={{ color: "var(--brand-blue)", textDecoration: "none" }}>Privacy Policy</Link>{" · "}
        <Link href="/terms" style={{ color: "var(--brand-blue)", textDecoration: "none" }}>Terms of Service</Link>{" · "}
        <Link href="/contact" style={{ color: "var(--brand-blue)", textDecoration: "none" }}>Contact Us</Link>
      </p>
    </footer>
  );
}

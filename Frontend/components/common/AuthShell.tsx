import Link from "next/link";

interface AuthShellProps {
  children: React.ReactNode;
  panelHeading: string;
  panelBody: string;
  panelPoints: { icon: string; label: string }[];
}

export default function AuthShell({ children, panelHeading, panelBody, panelPoints }: AuthShellProps) {
  return (
    <div className="auth-layout">
      <div className="auth-left">
        <div className="auth-form-box" style={{ width: "100%" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", marginBottom: 40 }}>
            <div style={{ width: 32, height: 32, background: "var(--brand-blue)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}></div>
            <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.03em" }}>
              Teledent<span style={{ color: "var(--brand-blue)" }}>AI</span>
            </span>
          </Link>
          {children}
          <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 32 }}>© 2024 Teledent AI. All rights reserved.</p>
        </div>
      </div>

      <div className="auth-right">
        <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 14, lineHeight: 1.25 }}>{panelHeading}</h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", lineHeight: 1.8, marginBottom: 36 }}>{panelBody}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {panelPoints.map((p) => (
              <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.1)", borderRadius: "var(--radius)", padding: "12px 16px", textAlign: "left", backdropFilter: "blur(4px)" }}>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", fontWeight: 500 }}>{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

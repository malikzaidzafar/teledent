"use client";
import Link from "next/link";
import { useSidebar } from "@/lib/sidebar-context";

interface MobileHeaderProps {
  title?: string;
}

export default function MobileHeader({ title }: MobileHeaderProps) {
  const { toggle } = useSidebar();
  return (
    <header className="mobile-header">
      <button
        id="mobile-menu-toggle"
        onClick={toggle}
        style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", borderRadius: "var(--radius)", color: "var(--text-primary)", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        aria-label="Toggle menu"
      >

      </button>
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
        <div style={{ width: 28, height: 28, background: "var(--brand-blue)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#fff" }}></div>
        <span className="logo-text" style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.03em" }}>
          Teledent<span style={{ color: "var(--brand-blue)" }}>AI</span>
        </span>
      </Link>
      {title && (
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", marginLeft: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </span>
      )}
    </header>
  );
}

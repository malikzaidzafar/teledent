"use client";
import { useState } from "react";
import { SectionCard } from "@/components/ui/shared";

interface SettingRowProps {
  label: string;
  description: string;
  defaultChecked?: boolean;
}

export function SettingToggle({ label, description, defaultChecked = false }: SettingRowProps) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--surface-3)" }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{description}</div>
      </div>
      <button
        role="switch"
        aria-checked={on}
        onClick={() => setOn(!on)}
        style={{
          width: 44, height: 24, borderRadius: 999, border: "none", cursor: "pointer",
          background: on ? "var(--brand-blue)" : "var(--border-strong)",
          position: "relative", transition: "background 0.2s", flexShrink: 0,
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: on ? 23 : 3,
          width: 18, height: 18, borderRadius: "50%", background: "#fff",
          transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </button>
    </div>
  );
}

export function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SectionCard title={title}>
      <div style={{ padding: "0 20px" }}>{children}</div>
    </SectionCard>
  );
}

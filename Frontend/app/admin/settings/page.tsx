/* TEMPORARILY COMMENTED OUT
"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader, SectionCard } from "@/components/ui/shared";
import { useRequireAuth } from "@/lib/auth";
import { adminApi, type PlatformSettings } from "@/lib/api";
import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type Tab = "platform" | "notifications" | "security" | "ai";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "platform",      label: "Platform",      icon: "" },
  { id: "notifications", label: "Notifications",  icon: "" },
  { id: "security",      label: "Security",       icon: "" },
  { id: "ai",            label: "AI & Analysis",  icon: "" },
];

const TIMEZONES = ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Karachi", "Asia/Dubai", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"];
const LANGUAGES = [{ value: "en", label: "English" }, { value: "fr", label: "French" }, { value: "ar", label: "Arabic" }, { value: "ur", label: "Urdu" }];
const AI_MODELS  = ["v1", "v2", "v3-beta"];

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
          background: checked ? "var(--brand-blue)" : "var(--border)",
          position: "relative", flexShrink: 0, transition: "background .2s",
        }}
        role="switch"
        aria-checked={checked}
      >
        <span style={{
          position: "absolute", top: 3, left: checked ? 22 : 2,
          width: 18, height: 18, borderRadius: "50%", background: "#fff",
          transition: "left .2s", display: "block",
        }} />
      </button>
    </div>
  );
}

function NumberField({ label, description, value, onChange, min, max }: {
  label: string; description?: string; value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{description}</div>}
      </div>
      <input
        type="number"
        className="input"
        style={{ width: 90, textAlign: "center" }}
        value={value}
        min={min}
        max={max}
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function AdminSettingsPage() {
  const { loading: authLoading } = useRequireAuth("admin");

  const [tab, setTab] = useState<Tab>("platform");
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi.getSettings()
      .then(setSettings)
      .catch(() => setError("Failed to load settings."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await adminApi.updateSettings(settings);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  function patch<K extends keyof PlatformSettings>(section: K, key: keyof PlatformSettings[K], value: unknown) {
    setSettings(prev => {
      if (!prev) return prev;
      return { ...prev, [section]: { ...prev[section], [key]: value } };
    });
  }

  if (authLoading) return null;

  return (
    <AppLayout role="admin" pageTitle="Platform Settings">
      <PageHeader
        title="Platform Settings"
        subtitle="Configure your TeleDent AI platform behaviour, security, and integrations."
        action={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {saved && <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}> Saved!</span>}
            {error && <span style={{ fontSize: 13, color: "#b91c1c" }}>{error}</span>}
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        }
      />

      <div className="page-body">
        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "2px solid var(--border)", paddingBottom: 0 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "10px 20px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14,
                background: "none",
                color: tab === t.id ? "var(--brand-blue)" : "var(--text-muted)",
                borderBottom: tab === t.id ? "2px solid var(--brand-blue)" : "2px solid transparent",
                marginBottom: -2, transition: "color .15s",
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)" }}>Loading settings…</div>
        ) : !settings ? (
          <div style={{ padding: 40, textAlign: "center", color: "#b91c1c" }}>Could not load settings. {error}</div>
        ) : (
          <>
            {/* ── Platform ── */}
            {tab === "platform" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                <SectionCard title="General">
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "4px 0" }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Platform Name</label>
                      <input
                        className="input"
                        value={settings.platform.platform_name}
                        onChange={e => patch("platform", "platform_name", e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Support Email</label>
                      <input
                        className="input"
                        type="email"
                        value={settings.platform.support_email}
                        onChange={e => patch("platform", "support_email", e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Default Language</label>
                      <select
                        className="input"
                        value={settings.platform.default_language}
                        onChange={e => patch("platform", "default_language", e.target.value)}
                      >
                        {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Timezone</label>
                      <select
                        className="input"
                        value={settings.platform.timezone}
                        onChange={e => patch("platform", "timezone", e.target.value)}
                      >
                        {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                      </select>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Maintenance">
                  <div style={{ padding: "4px 0" }}>
                    <Toggle
                      checked={settings.platform.maintenance_mode}
                      onChange={v => patch("platform", "maintenance_mode", v)}
                      label="Maintenance Mode"
                      description="When enabled, the platform shows a maintenance page to all non-admin users."
                    />
                    {settings.platform.maintenance_mode && (
                      <div style={{
                        marginTop: 16, padding: "12px 16px", background: "#fef3c7",
                        borderRadius: 10, fontSize: 13, color: "#92400e", fontWeight: 500,
                      }}>
                         Maintenance mode is ON — patients and dentists cannot access the platform.
                      </div>
                    )}
                  </div>
                </SectionCard>
              </div>
            )}

            {/* ── Notifications ── */}
            {tab === "notifications" && (
              <SectionCard title="Email & Alert Preferences">
                <div style={{ padding: "0 4px" }}>
                  <Toggle
                    checked={settings.notifications.email_on_new_patient}
                    onChange={v => patch("notifications", "email_on_new_patient", v)}
                    label="New Patient Registration"
                    description="Send admin email when a new patient creates an account."
                  />
                  <Toggle
                    checked={settings.notifications.email_on_dentist_request}
                    onChange={v => patch("notifications", "email_on_dentist_request", v)}
                    label="Dentist Approval Request"
                    description="Alert admin when a dentist signs up and awaits approval."
                  />
                  <Toggle
                    checked={settings.notifications.email_on_scan_complete}
                    onChange={v => patch("notifications", "email_on_scan_complete", v)}
                    label="Scan Analysis Complete"
                    description="Notify dentist and patient when AI finishes analysing a scan."
                  />
                  <Toggle
                    checked={settings.notifications.sms_alerts}
                    onChange={v => patch("notifications", "sms_alerts", v)}
                    label="SMS Alerts"
                    description="Send SMS notifications for critical events (requires Twilio integration)."
                  />
                </div>
              </SectionCard>
            )}

            {/* ── Security ── */}
            {tab === "security" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                <SectionCard title="Authentication">
                  <div style={{ padding: "0 4px" }}>
                    <Toggle
                      checked={settings.security.require_email_verification}
                      onChange={v => patch("security", "require_email_verification", v)}
                      label="Require Email Verification"
                      description="Users must verify their email before accessing the platform."
                    />
                    <Toggle
                      checked={settings.security.two_factor_required}
                      onChange={v => patch("security", "two_factor_required", v)}
                      label="Enforce Two-Factor Auth"
                      description="All admin and dentist accounts must use 2FA."
                    />
                    <NumberField
                      label="Session Timeout (minutes)"
                      description="Automatically log out inactive users after this duration."
                      value={settings.security.session_timeout_minutes}
                      onChange={v => patch("security", "session_timeout_minutes", v)}
                      min={5} max={1440}
                    />
                    <NumberField
                      label="Max Login Attempts"
                      description="Lock account after this many failed login attempts."
                      value={settings.security.max_login_attempts}
                      onChange={v => patch("security", "max_login_attempts", v)}
                      min={3} max={20}
                    />
                  </div>
                </SectionCard>

                <SectionCard title="Compliance">
                  <div style={{ padding: "10px 0" }}>
                    {[
                      { label: "HIPAA Compliant Storage", ok: true },
                      { label: "Data Encryption at Rest", ok: true },
                      { label: "TLS 1.3 in Transit", ok: true },
                      { label: "Audit Logging", ok: true },
                      { label: "GDPR Data Deletion", ok: false },
                    ].map(item => (
                      <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 14 }}>
                        <span>{item.label}</span>
                        <span style={{ fontWeight: 600, color: item.ok ? "#16a34a" : "#b91c1c" }}>
                          {item.ok ? " Enabled" : " Review"}
                        </span>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>
            )}

            {/* ── AI ── */}
            {tab === "ai" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                <SectionCard title="AI Analysis Engine">
                  <div style={{ padding: "0 4px" }}>
                    <Toggle
                      checked={settings.ai.auto_analyze_scans}
                      onChange={v => patch("ai", "auto_analyze_scans", v)}
                      label="Auto-Analyse Uploaded Scans"
                      description="Automatically run AI analysis when a patient uploads a new scan."
                    />
                    <div style={{ padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Confidence Threshold</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                        Findings below this score are suppressed from reports. Current: <strong>{Math.round(settings.ai.confidence_threshold * 100)}%</strong>
                      </div>
                      <input
                        type="range"
                        min={0.5} max={0.99} step={0.01}
                        value={settings.ai.confidence_threshold}
                        onChange={e => patch("ai", "confidence_threshold", parseFloat(e.target.value))}
                        style={{ width: "100%", accentColor: "var(--brand-blue)" }}
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                        <span>50% (more findings)</span>
                        <span>99% (very strict)</span>
                      </div>
                    </div>
                    <div style={{ padding: "14px 0" }}>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Model Version</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                        Select the active AI model for scan analysis.
                      </div>
                      <div style={{ display: "flex", gap: 10 }}>
                        {AI_MODELS.map(m => (
                          <button
                            key={m}
                            onClick={() => patch("ai", "model_version", m)}
                            style={{
                              padding: "8px 18px", borderRadius: 8, border: "1.5px solid",
                              borderColor: settings.ai.model_version === m ? "var(--brand-blue)" : "var(--border)",
                              background: settings.ai.model_version === m ? "var(--brand-blue)" : "var(--surface)",
                              color: settings.ai.model_version === m ? "#fff" : "var(--text)",
                              fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all .15s",
                            }}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Model Performance">
                  <div style={{ padding: "10px 0" }}>
                    {[
                      { label: "Caries Detection Accuracy", value: "96.2%" },
                      { label: "Periapical Lesion F1", value: "91.4%" },
                      { label: "Avg. Processing Time", value: "3.1s" },
                      { label: "Model Last Updated", value: "2026-04-12" },
                      { label: "Training Dataset Size", value: "142,000 images" },
                    ].map(item => (
                      <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 14 }}>
                        <span style={{ color: "var(--text-muted)" }}>{item.label}</span>
                        <span style={{ fontWeight: 700 }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
END TEMPORARILY COMMENTED OUT */

export default function AdminSettingsPage() {
  return null;
}

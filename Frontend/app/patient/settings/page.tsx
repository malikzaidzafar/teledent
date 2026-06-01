"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader } from "@/components/ui/shared";
import { SettingToggle, SettingsSection } from "@/components/ui/SettingsUI";
import { useRequireAuth } from "@/lib/auth";
import { authApi } from "@/lib/api";
import { useState, useEffect, FormEvent } from "react";

export default function PatientSettingsPage() {
  const { user, loading: authLoading } = useRequireAuth("patient");
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) setForm({ first_name: user.first_name, last_name: user.last_name, email: user.email });
  }, [user]);

  if (authLoading) return null;

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      await authApi.updateMe({ first_name: form.first_name, last_name: form.last_name });
      setSaveMsg("Profile updated successfully.");
    } catch {
      setSaveMsg("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout role="patient" pageTitle="Settings">
      <PageHeader title="Settings" subtitle="Manage your account preferences and privacy." />
      <div className="page-body">
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Profile */}
          <SettingsSection title="Profile Information">
            <form onSubmit={handleSaveProfile} style={{ padding: "16px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div><label className="label">First Name</label><input className="input" value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} /></div>
              <div><label className="label">Last Name</label><input className="input" value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} /></div>
              <div style={{ gridColumn: "span 2" }}><label className="label">Email</label><input className="input" type="email" value={form.email} disabled style={{ opacity: 0.6 }} /></div>
              {saveMsg && (
                <div style={{ gridColumn: "span 2", fontSize: 13, color: saveMsg.includes("success") ? "var(--success)" : "#dc2626" }}>{saveMsg}</div>
              )}
              <div style={{ gridColumn: "span 2", paddingBottom: 8 }}>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
              </div>
            </form>
          </SettingsSection>

          {/* Privacy */}
          <SettingsSection title="Privacy & Security">
            <SettingToggle label="Data Sharing with Dentists" description="Allow assigned dentists to view your scan history." defaultChecked={true} />
            <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
              <div><label className="label">Current Password</label><input className="input" type="password" placeholder="••••••••" /></div>
              <div><label className="label">New Password</label><input className="input" type="password" placeholder="At least 8 characters" /></div>
              <button className="btn btn-outline btn-sm" style={{ alignSelf: "flex-start" }}>Update Password</button>
            </div>
          </SettingsSection>

          {/* Danger Zone */}
          <SettingsSection title="Delete My Account">
            <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Delete Account</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>Permanently delete your account and all associated data. This action cannot be undone.</div>
                <button className="btn btn-danger btn-sm">Delete My Account</button>
              </div>
            </div>
          </SettingsSection>

        </div>
      </div>
    </AppLayout>
  );
}

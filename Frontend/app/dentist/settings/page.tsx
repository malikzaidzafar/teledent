"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader } from "@/components/ui/shared";
import { SettingToggle, SettingsSection } from "@/components/ui/SettingsUI";
import { useRequireAuth } from "@/lib/auth";
import { authApi } from "@/lib/api";
import { useState, useEffect, FormEvent } from "react";

export default function DentistSettingsPage() {
  const { user, loading: authLoading } = useRequireAuth("dentist");
  const [form, setForm] = useState({ first_name: "", last_name: "" });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) setForm({ first_name: user.first_name, last_name: user.last_name });
  }, [user]);

  if (authLoading) return null;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      await authApi.updateMe(form);
      setSaveMsg("Profile updated successfully.");
    } catch {
      setSaveMsg("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout role="dentist" pageTitle="Settings">
      <PageHeader title="Settings" subtitle="Manage your account preferences and clinic details." />
      <div className="page-body">
        <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Profile */}
          <SettingsSection title="Account Information">
            <form onSubmit={handleSave} style={{ padding: "16px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div><label className="label">First Name</label><input className="input" value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} /></div>
              <div><label className="label">Last Name</label><input className="input" value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} /></div>
              <div style={{ gridColumn: "span 2" }}><label className="label">Email</label><input className="input" type="email" value={user?.email || ""} disabled style={{ opacity: 0.6 }} /></div>
              {saveMsg && (
                <div style={{ gridColumn: "span 2", fontSize: 13, color: saveMsg.includes("success") ? "var(--success)" : "#dc2626" }}>{saveMsg}</div>
              )}
              <div style={{ gridColumn: "span 2", paddingBottom: 8 }}>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
              </div>
            </form>
          </SettingsSection>

          {/* Notifications */}
          <SettingsSection title="Notification Preferences">
            <SettingToggle label="New Case Assigned"        description="Alert me when a new patient case is assigned to me." defaultChecked={true} />
            <SettingToggle label="Appointment Reminders"    description="Remind me 1 hour before each scheduled consultation." defaultChecked={true} />
            <SettingToggle label="Patient Messages"         description="Notify me of new messages from patients." defaultChecked={true} />
            <SettingToggle label="AI Analysis Complete"     description="Alert me when AI finishes processing a patient's scan." defaultChecked={true} />
            <SettingToggle label="Weekly Summary Report"    description="Receive a weekly digest of case activity and earnings." defaultChecked={false} />
          </SettingsSection>

          {/* Availability */}
          <SettingsSection title="Availability Settings">
            <div style={{ padding: "16px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div><label className="label">Available From</label><input className="input" type="time" defaultValue="09:00" /></div>
              <div><label className="label">Available Until</label><input className="input" type="time" defaultValue="17:00" /></div>
              <div style={{ gridColumn: "span 2" }}>
                <label className="label">Working Days</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d, i) => (
                    <label key={d} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" defaultChecked={i < 5} style={{ accentColor: "var(--brand-blue)" }} />{d}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ paddingBottom: 16 }}>
              <button className="btn btn-outline btn-sm">Update Availability</button>
            </div>
          </SettingsSection>

          {/* Security */}
          <SettingsSection title="Security">
            <SettingToggle label="Two-Factor Authentication" description="Secure your account with an authenticator app." defaultChecked={false} />
            <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
              <div><label className="label">Current Password</label><input className="input" type="password" placeholder="••••••••" /></div>
              <div><label className="label">New Password</label><input className="input" type="password" placeholder="At least 8 characters" /></div>
              <button className="btn btn-outline btn-sm" style={{ alignSelf: "flex-start" }}>Update Password</button>
            </div>
          </SettingsSection>

        </div>
      </div>
    </AppLayout>
  );
}

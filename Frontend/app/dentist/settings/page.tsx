"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader } from "@/components/ui/shared";
import { SettingToggle, SettingsSection } from "@/components/ui/SettingsUI";
import { useRequireAuth } from "@/lib/auth";
import { authApi, dentistApi } from "@/lib/api";
import { useState, useEffect, FormEvent } from "react";

const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function DentistSettingsPage() {
  const { user, loading: authLoading } = useRequireAuth("dentist");
  const [form, setForm] = useState({ first_name: "", last_name: "" });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [avail, setAvail] = useState({ available_from: "09:00", available_until: "17:00", working_days: ["Mon", "Tue", "Wed", "Thu", "Fri"] });
  const [availSaving, setAvailSaving] = useState(false);
  const [availMsg, setAvailMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) setForm({ first_name: user.first_name, last_name: user.last_name });
  }, [user]);

  useEffect(() => {
    dentistApi.getMyAvailability().then(data => {
      setAvail({ available_from: data.available_from, available_until: data.available_until, working_days: data.working_days });
    }).catch(() => {/* use defaults */});
  }, []);

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

  async function handleAvailabilitySave() {
    setAvailSaving(true);
    setAvailMsg(null);
    try {
      await dentistApi.updateAvailability(avail);
      setAvailMsg("Availability updated successfully.");
    } catch {
      setAvailMsg("Failed to update availability.");
    } finally {
      setAvailSaving(false);
    }
  }

  return (
    <AppLayout role="dentist" pageTitle="Settings">
      <PageHeader title="Settings" subtitle="Manage your account preferences and clinic details." />
      <div className="page-body">
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 20 }}>

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
              <div><label className="label">Available From</label><input className="input" type="time" value={avail.available_from} onChange={e => setAvail(p => ({ ...p, available_from: e.target.value }))} /></div>
              <div><label className="label">Available Until</label><input className="input" type="time" value={avail.available_until} onChange={e => setAvail(p => ({ ...p, available_until: e.target.value }))} /></div>
              <div style={{ gridColumn: "span 2" }}>
                <label className="label">Working Days</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {ALL_DAYS.map((d) => (
                    <label key={d} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={avail.working_days.includes(d)}
                        onChange={e => setAvail(p => ({
                          ...p,
                          working_days: e.target.checked
                            ? [...p.working_days, d]
                            : p.working_days.filter(x => x !== d),
                        }))}
                        style={{ accentColor: "var(--brand-blue)" }}
                      />{d}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {availMsg && (
              <div style={{ fontSize: 13, marginBottom: 8, color: availMsg.includes("success") ? "var(--success)" : "#dc2626" }}>{availMsg}</div>
            )}
            <div style={{ paddingBottom: 16 }}>
              <button className="btn btn-outline btn-sm" onClick={handleAvailabilitySave} disabled={availSaving}>
                {availSaving ? "Saving…" : "Update Availability"}
              </button>
            </div>
          </SettingsSection>

          {/* Security */}
          <SettingsSection title="Security">
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

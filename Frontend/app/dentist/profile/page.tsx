"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader, Avatar, SectionCard } from "@/components/ui/shared";
import { useRequireAuth } from "@/lib/auth";
import { authApi } from "@/lib/api";
import { useEffect, useState, FormEvent } from "react";

export default function DentistProfilePage() {
  const { user, loading: authLoading } = useRequireAuth("dentist");
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setForm({ first_name: user.first_name, last_name: user.last_name, email: user.email });
    }
  }, [user]);

  if (authLoading) return null;

  async function handleSave(e: FormEvent) {
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

  const fullName = user ? `Dr. ${user.first_name} ${user.last_name}` : "Dr.";

  return (
    <AppLayout role="dentist" pageTitle="My Profile">
      <PageHeader
        title="My Profile"
        subtitle="Manage your public profile and credentials."
        action={
          <button className="btn btn-primary btn-sm" form="profile-form" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        }
      />
      <div className="page-body">
        {saveMsg && (
          <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--radius)", fontSize: 13, background: saveMsg.includes("success") ? "#dcfce7" : "#fef2f2", color: saveMsg.includes("success") ? "var(--success)" : "#dc2626" }}>
            {saveMsg}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24 }}>
          {/* Left: Avatar & Stats */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="card" style={{ textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                <Avatar name={fullName} size={80} />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{fullName}</h2>
              <div style={{ fontSize: 13, color: "var(--brand-blue)", fontWeight: 600, marginBottom: 16 }}>Dentist</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{user?.email}</div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Account Info</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { label: "Role",   value: "Dentist" },
                  { label: "Status", value: user?.is_active ? "Active" : "Inactive" },
                ].map((s) => (
                  <div key={s.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "var(--text-secondary)" }}>{s.label}</span>
                    <span style={{ fontWeight: 700 }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Edit Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <SectionCard title="Personal Information">
              <form id="profile-form" onSubmit={handleSave} style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                <div>
                  <label className="label">First Name</label>
                  <input className="input" value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} required />
                </div>
                <div>
                  <label className="label">Last Name</label>
                  <input className="input" value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} required />
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={form.email} disabled style={{ opacity: 0.6 }} />
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Email cannot be changed from this page.</div>
                </div>
              </form>
            </SectionCard>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader, Badge, Avatar, SectionCard } from "@/components/ui/shared";
import { useRequireAuth } from "@/lib/auth";
import { adminApi, type AdminDentist } from "@/lib/api";
import { useEffect, useState, useCallback, useRef } from "react";


function deriveStatus(d: AdminDentist): "Active" | "Pending" | "Suspended" {
  if (!d.is_approved) return "Pending";
  return "Active";
}

// ---------------------------------------------------------------------------
// Invite Modal
// ---------------------------------------------------------------------------
interface InviteModalProps {
  onClose: () => void;
  onInvited: () => void;
}
function InviteModal({ onClose, onInvited }: InviteModalProps) {
  const [form, setForm] = useState({ email: "", first_name: "", last_name: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await adminApi.inviteDentist(form);
      setSuccess(` Invited! Temp password: ${res.temp_password}`);
      setTimeout(() => { onInvited(); onClose(); }, 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to invite dentist.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--surface)", borderRadius: 16, padding: 32, width: 460,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)", maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Invite Dental Professional</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)" }}>×</button>
        </div>

        {success && (
          <div style={{ background: "#dcfce7", color: "#166534", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
            {success}
          </div>
        )}
        {error && (
          <div style={{ background: "#fef2f2", color: "#b91c1c", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>First Name *</label>
              <input className="input" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} required placeholder="Jane" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Last Name *</label>
              <input className="input" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} required placeholder="Smith" />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Email Address *</label>
            <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required placeholder="jane.smith@clinic.com" />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Sending…" : "Send Invitation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dentist Detail Drawer
// ---------------------------------------------------------------------------
function DentistDrawer({ dentist, onClose, onAction }: { dentist: AdminDentist; onClose: () => void; onAction: () => void }) {
  const status = deriveStatus(dentist);
  const [acting, setActing] = useState(false);

  async function handleApprove() {
    setActing(true);
    try { await adminApi.approveDentist(dentist.id); onAction(); } finally { setActing(false); }
  }
  async function handleSuspend() {
    setActing(true);
    try { await adminApi.suspendDentist(dentist.id); onAction(); } finally { setActing(false); }
  }
  async function handleReactivate() {
    setActing(true);
    try { await adminApi.reactivateDentist(dentist.id); onAction(); } finally { setActing(false); }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 900,
      display: "flex", justifyContent: "flex-end",
    }} onClick={onClose}>
      <div style={{
        width: 380, background: "var(--surface)", height: "100%", padding: 28, overflowY: "auto",
        boxShadow: "-8px 0 30px rgba(0,0,0,0.15)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Dentist Profile</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)" }}>×</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <Avatar name={dentist.full_name} size={56} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{dentist.full_name}</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{dentist.email}</div>
            <div style={{ marginTop: 6 }}>
              <Badge variant={status === "Active" ? "success" : status === "Pending" ? "warning" : "gray"}>{status}</Badge>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Rating", value: dentist.rating ? ` ${dentist.rating.toFixed(1)}` : "—" },
            { label: "Dentist ID", value: dentist.id.slice(0, 8) + "…" },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {status === "Pending" && (
            <button className="btn btn-primary" disabled={acting} onClick={handleApprove}>
              {acting ? "Processing…" : " Approve Dentist"}
            </button>
          )}
          {status === "Active" && (
            <button className="btn btn-danger" disabled={acting} onClick={handleSuspend}>
              {acting ? "Processing…" : " Suspend Dentist"}
            </button>
          )}
          {status === "Suspended" && (
            <button className="btn btn-primary" disabled={acting} onClick={handleReactivate}>
              {acting ? "Processing…" : " Reactivate Dentist"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function AdminDentistsPage() {
  const { loading: authLoading } = useRequireAuth("admin");

  const [dentists, setDentists] = useState<AdminDentist[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [selected, setSelected] = useState<AdminDentist | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDentists = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await adminApi.listDentists({
        page: p,
        limit: 15,
        search: search || undefined,
      });
      const enriched = res.data.map(d => ({ ...d, status: deriveStatus(d) })) as AdminDentist[];
      setDentists(enriched);
      setTotal(res.total);
      setPages(res.pages);
      setPage(res.page);
    } catch {
      setDentists([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchDentists(1), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [fetchDentists]);

  if (authLoading) return null;

  // Client-side status filter on top of server data
  const filtered = statusFilter
    ? dentists.filter(d => deriveStatus(d) === statusFilter)
    : dentists;

  const counts = {
    Active: dentists.filter(d => deriveStatus(d) === "Active").length,
    Pending: dentists.filter(d => deriveStatus(d) === "Pending").length,
    Suspended: dentists.filter(d => deriveStatus(d) === "Suspended").length,
  };

  return (
    <AppLayout role="admin" pageTitle="Dentist Management">
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onInvited={() => fetchDentists(1)} />}
      {selected && <DentistDrawer dentist={selected} onClose={() => setSelected(null)} onAction={() => { setSelected(null); fetchDentists(page); }} />}

      <PageHeader
        title="Dentist Management"
        subtitle={`${total} registered dental professional${total !== 1 ? "s" : ""}`}
      />

      <div className="page-body">
        {/* Summary pills */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          {(["", "Active", "Pending", "Suspended"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: "1.5px solid",
                borderColor: statusFilter === s ? "var(--brand-blue)" : "var(--border)",
                background: statusFilter === s ? "var(--brand-blue)" : "var(--surface)",
                color: statusFilter === s ? "#fff" : "var(--text)",
                transition: "all .15s",
              }}
            >
              {s === "" ? "All" : s}
              {s !== "" && (
                <span style={{ marginLeft: 6, opacity: 0.75, fontWeight: 400 }}>
                  ({counts[s as keyof typeof counts]})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="  Search by name or email…"
            style={{ maxWidth: 300, flex: 1 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

        </div>

        <SectionCard title={`${filtered.length} Dentist${filtered.length !== 1 ? "s" : ""}${statusFilter ? ` · ${statusFilter}` : ""}`}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}></div>
              Loading dentists…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}></div>
              No dentists found.{" "}
              {search ? (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ marginLeft: 8 }}
                  onClick={() => { setSearch(""); setStatusFilter(""); }}
                >
                  Clear filters
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" style={{ marginLeft: 8 }} onClick={() => setShowInvite(true)}>
                  Invite first dentist
                </button>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dentist</th>
                  <th>Rating</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => {
                  const st = deriveStatus(d);
                  return (
                    <tr key={d.id} style={{ cursor: "pointer" }} onClick={() => setSelected(d)}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar name={d.full_name} size={34} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{d.full_name}</div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{d.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {d.rating
                          ? <span style={{ fontWeight: 700, color: "#d97706" }}> {d.rating.toFixed(1)}</span>
                          : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>No rating</span>}
                      </td>
                      <td>
                        <Badge variant={st === "Active" ? "success" : st === "Pending" ? "warning" : "gray"}>{st}</Badge>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(d)}>View</button>
                          {st === "Pending" && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={async () => {
                                await adminApi.approveDentist(d.id);
                                fetchDentists(page);
                              }}
                            >
                              Approve
                            </button>
                          )}
                          {st === "Active" && (
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={async () => {
                                await adminApi.suspendDentist(d.id);
                                fetchDentists(page);
                              }}
                            >
                              Suspend
                            </button>
                          )}
                          {st === "Suspended" && (
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={async () => {
                                await adminApi.reactivateDentist(d.id);
                                fetchDentists(page);
                              }}
                            >
                              Reactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0 0", marginTop: 8, borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Page {page} of {pages} · {total} total
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => fetchDentists(page - 1)}> Prev</button>
                {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    className={`btn btn-sm ${p === page ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => fetchDentists(p)}
                  >
                    {p}
                  </button>
                ))}
                <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => fetchDentists(page + 1)}>Next </button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </AppLayout>
  );
}


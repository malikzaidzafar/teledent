"use client";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader, Badge, Avatar, SectionCard } from "@/components/ui/shared";
import { useRequireAuth } from "@/lib/auth";
import { patientApi, type PatientSummary } from "@/lib/api";
import { useEffect, useState } from "react";

export default function AdminPatientsPage() {
  const { loading: authLoading } = useRequireAuth("admin");
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    setLoading(true);
    patientApi.list({ limit: 50, search: search || undefined, status: status || undefined })
      .then(res => { setPatients(res.data); setTotal(res.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, status]);

  if (authLoading) return null;

  return (
    <AppLayout role="admin" pageTitle="Patient Management">
      <PageHeader title="Patient Management" subtitle={`${total} total registered patients`} />
      <div className="page-body">
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <input className="input" placeholder="  Search patients…" style={{ maxWidth: 280 }} value={search} onChange={e => setSearch(e.target.value)} />
          <select className="input" style={{ maxWidth: 160 }} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading patients…</div>
        ) : (
          <SectionCard title={`${patients.length} Patient${patients.length !== 1 ? "s" : ""}`}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient</th><th>Scans</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {patients.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>No patients found.</td></tr>
                ) : patients.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar name={p.full_name} size={32} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{p.full_name}</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{p.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 13, fontWeight: 600 }}>{p.scan_count}</td>
                    <td>
                      <Badge variant={p.status === "active" ? "success" : p.status === "pending" ? "warning" : "gray"}>
                        {p.status}
                      </Badge>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn-ghost btn-sm">View</button>
                        <button className="btn btn-danger btn-sm">Suspend</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        )}
      </div>
    </AppLayout>
  );
}

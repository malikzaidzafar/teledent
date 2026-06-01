interface StatCardProps {
  icon: string;
  iconBg: string;
  value: string;
  label: string;
  change?: string;
  changePositive?: boolean;
}

export function StatCard({ icon, iconBg, value, label, change, changePositive }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {change && (
        <div className="stat-change" style={{ color: changePositive ? "var(--success)" : "var(--danger)" }}>
          {changePositive ? "" : ""} {change}
        </div>
      )}
    </div>
  );
}

interface BadgeProps {
  variant: "success" | "warning" | "danger" | "blue" | "gray";
  children: React.ReactNode;
}

export function Badge({ variant, children }: BadgeProps) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}

interface AvatarProps {
  name: string;
  size?: number;
}

export function Avatar({ name, size = 36 }: AvatarProps) {
  const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className="avatar-placeholder" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
}

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div style={{ textAlign: "center", padding: "80px 32px" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</h3>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: action ? 24 : 0 }}>{description}</p>
      {action}
    </div>
  );
}

interface SectionCardProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function SectionCard({ title, children, action }: SectionCardProps) {
  return (
    <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

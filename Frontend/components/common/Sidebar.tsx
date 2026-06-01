"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/lib/sidebar-context";
import { useAuth } from "@/lib/auth";

interface NavItem { href: string; label: string; icon: string; }

const NAV_MAP = {
  patient: [
    { href: "/patient/dashboard",     label: "Dashboard",     icon: "⊞" },
    { href: "/patient/scan",          label: "Upload Scan",   icon: "" },
    { href: "/patient/scans",         label: "My Scans",      icon: "" },
    { href: "/patient/appointments",  label: "Appointments",  icon: "" },
    { href: "/patient/video",         label: "Video Call",    icon: "" },
  ] as NavItem[],
  dentist: [
    { href: "/dentist/dashboard",     label: "Dashboard",     icon: "⊞" },
    { href: "/dentist/cases",         label: "Patient Cases", icon: "" },
    { href: "/dentist/messages",      label: "Messages",      icon: "" },
    { href: "/dentist/profile",       label: "My Profile",    icon: "" },
    { href: "/dentist/video",         label: "Video Sessions", icon: "" },
  ] as NavItem[],
  admin: [
    { href: "/admin/dashboard",       label: "Dashboard",     icon: "⊞" },
    { href: "/admin/patients",        label: "Patients",      icon: "" },
    { href: "/admin/dentists",        label: "Dentists",      icon: "" },
    { href: "/admin/analytics",       label: "Analytics",     icon: "" },
    { href: "/admin/settings",        label: "Settings",      icon: "" },
  ] as NavItem[],
};

const ROLE_BADGE = {
  patient: { bg: "#dcfce7", color: "#16a34a" },
  dentist: { bg: "#e8f0fd", color: "#135bec" },
  admin:   { bg: "#fef3c7", color: "#d97706" },
};

interface SidebarProps { role: "patient" | "dentist" | "admin"; userName?: string; userEmail?: string; }

export default function Sidebar({ role, userName: nameProp, userEmail: emailProp }: SidebarProps) {
  const pathname = usePathname();
  const { isOpen, close } = useSidebar();
  const { user, logout } = useAuth();
  const nav = NAV_MAP[role];
  const badge = ROLE_BADGE[role];
  const userName = user ? `${user.first_name} ${user.last_name}` : (nameProp || "User");
  const userEmail = user?.email || emailProp || `${role}@teledent.ai`;
  const initials = userName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <>
      {/* Overlay */}
      <div className={`sidebar-overlay ${isOpen ? "sidebar-open" : ""}`} onClick={close} />

      <aside className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-logo">
          <div className="logo-icon"></div>
          <div>
            <div className="logo-text">Teledent<span>AI</span></div>
            <div style={{ fontSize: 10, fontWeight: 600, color: badge.color, background: badge.bg, borderRadius: 4, padding: "1px 6px", display: "inline-block", marginTop: 2, textTransform: "capitalize" }}>
              {role} portal
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Main Menu</div>
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href} className={`nav-item ${active ? "active" : ""}`} onClick={close}>
                {item.icon && <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0, opacity: active ? 1 : 0.7 }}>{item.icon}</span>}
                {item.label}
              </Link>
            );
          })}
          <div className="nav-section-label">Account</div>
          <Link href={`/${role}/settings`} className={`nav-item ${pathname === `/${role}/settings` ? "active" : ""}`} onClick={close}>
            <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0, opacity: pathname === `/${role}/settings` ? 1 : 0.7 }}>⚙️</span>
            Settings
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="avatar-placeholder" style={{ width: 34, height: 34, fontSize: 12 }}>{initials}</div>
            <div style={{ overflow: "hidden", flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text-primary)" }}>{userName}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{userEmail || `${role}@teledent.ai`}</div>
            </div>
            <button
              title="Log Out"
              onClick={() => { close(); logout(); }}
              style={{ flexShrink: 0, background: "none", border: "1px solid var(--border)", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-muted)", transition: "all 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#fef2f2"; (e.currentTarget as HTMLButtonElement).style.color = "#dc2626"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#fecaca"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

"use client";
import { SidebarProvider } from "@/lib/sidebar-context";
import Sidebar from "@/components/common/Sidebar";
import MobileHeader from "@/components/common/MobileHeader";

interface AppLayoutProps {
  role: "patient" | "dentist" | "admin";
  userName?: string;
  userEmail?: string;
  pageTitle?: string;
  children: React.ReactNode;
}

export default function AppLayout({ role, userName, userEmail, pageTitle, children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <div className="app-layout">
        <Sidebar role={role} userName={userName} userEmail={userEmail} />
        <div className="main-content">
          <MobileHeader title={pageTitle} />
          {children}
        </div>
      </div>
    </SidebarProvider>
  );
}

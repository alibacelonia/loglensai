"use client";

import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";

import { AppFooter } from "@/components/app-shell/app-footer";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { useSidebarState } from "@/components/app-shell/use-sidebar-state";

const SIDEBAR_EXPANDED_WIDTH = 260;
const SIDEBAR_COLLAPSED_WIDTH = 72;

export default function AppLayout({ children }: { children: ReactNode }) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const { isCollapsed, toggleSidebar } = useSidebarState();

  const sidebarWidth = isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
  const shellStyle = {
    "--sidebar-width": `${sidebarWidth}px`
  } as CSSProperties;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar isCollapsed={isCollapsed} onToggle={toggleSidebar} />
      <MobileNav open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen} />

      <div className="flex min-h-screen flex-col transition-[padding-left] duration-200 md:pl-[var(--sidebar-width)]" style={shellStyle}>
        <Topbar onMobileMenuOpen={() => setIsMobileNavOpen(true)} />
        <div className="flex min-h-0 flex-1 flex-col">
          <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">{children}</main>
          <AppFooter />
        </div>
      </div>
    </div>
  );
}

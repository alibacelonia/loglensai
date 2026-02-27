"use client";

import { Activity, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { getPageTitle } from "@/components/app-shell/nav-items";
import { Button } from "@/components/ui/button";

type TopbarProps = {
  onMobileMenuOpen: () => void;
};

export function Topbar({ onMobileMenuOpen }: TopbarProps) {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);
  const [queueHealth, setQueueHealth] = useState<"ok" | "degraded">("degraded");
  const [environment, setEnvironment] = useState("dev");

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const response = await fetch("/api/system/status", { cache: "no-store" });
        const body = (await response.json().catch(() => ({}))) as {
          environment?: string;
          queue_health?: "ok" | "degraded";
        };
        if (!response.ok) {
          if (!cancelled) {
            setQueueHealth("degraded");
          }
          return;
        }
        if (!cancelled) {
          setEnvironment(body.environment || "dev");
          setQueueHealth(body.queue_health === "ok" ? "ok" : "degraded");
        }
      } catch {
        if (!cancelled) {
          setQueueHealth("degraded");
        }
      }
    }

    void loadStatus();
    const timer = setInterval(() => {
      void loadStatus();
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/80 bg-background/85 px-4 backdrop-blur md:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMobileMenuOpen}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{pageTitle}</p>
          <p className="truncate text-xs text-muted-foreground">AI Log Analyzer</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div
          className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-3 text-xs text-muted-foreground"
          aria-label="Environment and queue status"
        >
          <Activity className={`h-3.5 w-3.5 ${queueHealth === "ok" ? "text-emerald-400" : "text-amber-400"}`} />
          <span className="uppercase tracking-[0.1em]">{environment}</span>
          <span className="text-foreground">{queueHealth === "ok" ? "queue healthy" : "queue degraded"}</span>
        </div>
      </div>
    </header>
  );
}

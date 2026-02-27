import { Activity, Database, FileSearch, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

const NAV_ITEMS = [
  { icon: Activity, label: "Dashboard", href: "/" },
  { icon: FileSearch, label: "Analyses", href: "/analyses" },
  { icon: Database, label: "Sources", href: "/sources/new" },
  { icon: ShieldCheck, label: "Security", href: "/security" }
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1440px] gap-4 px-4 py-4 md:px-6 lg:px-8">
        <aside className="hidden w-64 shrink-0 md:block">
          <Card className="sticky top-4 space-y-4 p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">LogLens AI</p>
              <h1 className="mt-1 text-lg font-semibold">Mission Control</h1>
            </div>
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </Card>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-4">
          <Card className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Environment</p>
              <h2 className="text-base font-semibold">Local Development</h2>
            </div>
            <div className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
              Backend + Worker Online
            </div>
          </Card>
          {children}
        </main>
      </div>
    </div>
  );
}

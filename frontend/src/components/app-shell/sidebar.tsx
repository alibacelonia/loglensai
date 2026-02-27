"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronUp, KeyRound, LogOut, PanelLeftClose, PanelLeftOpen, UserCircle2 } from "lucide-react";

import { NAV_GROUPS, isRouteActive } from "@/components/app-shell/nav-items";
import { useSessionUser } from "@/components/app-shell/use-session-user";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type SidebarProps = {
  isCollapsed: boolean;
  onToggle: () => void;
};

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, initials } = useSessionUser();
  const username = user?.username || (isLoading ? "Loading..." : "Account");
  const email = user?.email || (isLoading ? "Checking session..." : "Not signed in");

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const accountButton = (
    <Button
      variant="ghost"
      className={cn(
        "h-11 w-full rounded-lg border border-transparent text-xs hover:bg-muted/60",
        isCollapsed ? "justify-center px-0" : "justify-start px-2"
      )}
      aria-label="Open account menu"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-semibold text-foreground">
        {initials}
      </span>
      <span className={cn("ml-2 min-w-0 flex-1 text-left", isCollapsed && "hidden")}>
        <span className="block truncate text-xs font-medium text-foreground">{username}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{email}</span>
      </span>
      <ChevronUp className={cn("h-3.5 w-3.5 text-muted-foreground", isCollapsed && "hidden")} />
    </Button>
  );

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 hidden h-screen flex-col border-r border-border/80 bg-card md:flex"
      style={{ width: isCollapsed ? 72 : 260 }}
    >
      <div className="flex h-16 items-center justify-between px-3">
        <div className={cn("min-w-0", isCollapsed && "sr-only")}>
          <p className="truncate text-[11px] uppercase tracking-[0.2em] text-muted-foreground">AI Log Analyzer</p>
          <p className="truncate text-xs font-medium text-foreground">Operations Console</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggle}
        >
          {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      <Separator />

      <TooltipProvider delayDuration={120}>
        <ScrollArea className="flex-1">
          <nav className="space-y-5 px-2 py-3">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="space-y-1.5">
                {!isCollapsed ? (
                  <p className="px-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{group.title}</p>
                ) : null}
                {group.items.map((item) => {
                  const active = isRouteActive(pathname, item.href);
                  const linkClassName = cn(
                    "group flex h-11 items-center rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isCollapsed ? "justify-center px-0" : "gap-2.5 px-3",
                    active
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  );

                  const link = (
                    <Link href={item.href} className={linkClassName} aria-label={item.title}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className={cn("truncate", isCollapsed && "hidden")}>{item.title}</span>
                    </Link>
                  );

                  if (!isCollapsed) {
                    return <div key={item.href}>{link}</div>;
                  }

                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.title}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </nav>
        </ScrollArea>

        <Separator />

        <div className="p-2">
          <DropdownMenu>
            {isCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>{accountButton}</DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="right">Account</TooltipContent>
              </Tooltip>
            ) : (
              <DropdownMenuTrigger asChild>{accountButton}</DropdownMenuTrigger>
            )}
            <DropdownMenuContent side="right" align="start" className="w-52">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <UserCircle2 className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem>
                <KeyRound className="mr-2 h-4 w-4" />
                Change password
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipProvider>
    </aside>
  );
}

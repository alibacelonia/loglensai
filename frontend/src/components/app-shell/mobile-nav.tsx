"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { KeyRound, LogOut, UserCircle2 } from "lucide-react";

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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type MobileNavProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, initials } = useSessionUser();
  const username = user?.username || (isLoading ? "Loading..." : "Account");
  const email = user?.email || (isLoading ? "Checking session..." : "Not signed in");

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    onOpenChange(false);
    router.replace("/login");
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[280px] border-r border-border/80 bg-card p-0 sm:max-w-[280px]">
        <SheetHeader className="px-4 py-4">
          <SheetTitle>AI Log Analyzer</SheetTitle>
          <p className="text-xs text-muted-foreground">Navigation</p>
        </SheetHeader>
        <Separator />
        <ScrollArea className="h-[calc(100vh-81px)] px-2 py-3">
          <div className="flex min-h-full flex-col">
            <nav className="space-y-5">
              {NAV_GROUPS.map((group) => (
                <div key={group.title} className="space-y-1.5">
                  <p className="px-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{group.title}</p>
                  {group.items.map((item) => {
                    const active = isRouteActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => onOpenChange(false)}
                        className={cn(
                          "flex h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                          active
                            ? "bg-primary/10 text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div className="mt-auto pt-4">
              <Separator className="mb-2" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-11 w-full justify-start rounded-lg px-2 text-xs"
                    aria-label="Open account menu"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-semibold text-foreground">
                      {initials}
                    </span>
                    <span className="ml-2 min-w-0 flex-1 text-left">
                      <span className="block truncate text-xs font-medium text-foreground">{username}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{email}</span>
                    </span>
                  </Button>
                </DropdownMenuTrigger>
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
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

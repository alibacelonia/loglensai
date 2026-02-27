"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type SessionUser = {
  id: number;
  username: string;
  email: string;
};

export function SessionControls() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) {
            setUser(null);
          }
          return;
        }

        const body = (await response.json()) as Partial<SessionUser>;
        if (!cancelled && typeof body.id === "number" && typeof body.username === "string") {
          setUser({
            id: body.id,
            username: body.username,
            email: typeof body.email === "string" ? body.email : ""
          });
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST"
      });
    } finally {
      setUser(null);
      setIsLoggingOut(false);
      router.replace("/login");
      router.refresh();
    }
  }

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Checking session...</p>;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Link href="/login" className="text-primary underline underline-offset-4">
          Sign in
        </Link>
        <Link href="/register" className="text-primary underline underline-offset-4">
          Register
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <p className="text-xs text-muted-foreground">Signed in as {user.username}</p>
      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="rounded-md border border-border bg-muted px-3 py-1 text-xs text-foreground transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoggingOut ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );
}

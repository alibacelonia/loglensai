"use client";

import { useEffect, useMemo, useState } from "react";

export type SessionUser = {
  id: number;
  username: string;
  email: string;
};

function buildInitials(username: string) {
  const cleaned = username.trim();
  if (!cleaned) {
    return "AU";
  }

  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }

  return cleaned.slice(0, 2).toUpperCase();
}

export function useSessionUser() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  const initials = useMemo(() => buildInitials(user?.username || ""), [user?.username]);

  return {
    user,
    isLoading,
    initials
  };
}

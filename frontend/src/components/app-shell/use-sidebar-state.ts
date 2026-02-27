"use client";

import { useEffect, useState } from "react";

const SIDEBAR_STORAGE_KEY = "ai-log-analyzer.sidebar-collapsed";

export function useSidebarState() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (storedValue === "true") {
        setIsCollapsed(true);
      }
    } catch {
      // Ignore localStorage read errors.
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isCollapsed));
    } catch {
      // Ignore localStorage write errors.
    }
  }, [isCollapsed, isHydrated]);

  return {
    isCollapsed,
    isHydrated,
    setIsCollapsed,
    toggleSidebar: () => setIsCollapsed((previousValue) => !previousValue)
  };
}

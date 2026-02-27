import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  FileText,
  Gauge,
  Plug,
  Radio,
  Settings,
  Upload
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Analysis",
    items: [
      { title: "Dashboard", href: "/", icon: Gauge },
      { title: "Upload Logs", href: "/upload-logs", icon: Upload },
      { title: "Live Tail", href: "/live-tail", icon: Radio }
    ]
  },
  {
    title: "Insights",
    items: [
      { title: "Anomalies", href: "/anomalies", icon: AlertTriangle },
      { title: "Incidents", href: "/incidents", icon: BarChart3 },
      { title: "Reports", href: "/reports", icon: FileText }
    ]
  },
  {
    title: "Admin",
    items: [
      { title: "Integrations", href: "/integrations", icon: Plug },
      { title: "Settings", href: "/settings", icon: Settings }
    ]
  }
];

export function isRouteActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getPageTitle(pathname: string) {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (isRouteActive(pathname, item.href)) {
        return item.title;
      }
    }
  }

  const segment = pathname.split("/").filter(Boolean).at(-1) || "dashboard";
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

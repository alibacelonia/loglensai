"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type DashboardCluster = {
  fingerprint: string;
  title: string;
  total_events: number;
  analyses: number;
  last_seen: string | null;
};

type DashboardJob = {
  id: number;
  source_id: number;
  source_name: string;
  status: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string;
  total_lines: number;
  error_count: number;
  cluster_count: number;
};

type DashboardSummary = {
  window: string;
  window_start: string;
  generated_at: string;
  kpis: {
    sources_ingested: number;
    analyses_total: number;
    analyses_completed: number;
    analyses_failed: number;
    success_rate: number;
    failure_rate: number;
    ingested_lines: number;
    error_lines: number;
  };
  top_clusters: DashboardCluster[];
  recent_jobs: DashboardJob[];
};

const WINDOW_OPTIONS = [
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
  { value: "30d", label: "Last 30d" }
] as const;

function formatDate(value: string | null) {
  if (!value) {
    return "n/a";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }
  return date.toLocaleString();
}

export default function DashboardPage() {
  const [windowValue, setWindowValue] = useState<(typeof WINDOW_OPTIONS)[number]["value"]>("24h");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function loadSummary(nextWindow: string, initialLoad: boolean) {
    if (initialLoad) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setErrorMessage("");
    try {
      const response = await fetch(`/api/dashboard/summary?window=${encodeURIComponent(nextWindow)}`, {
        cache: "no-store"
      });
      const body = (await response.json().catch(() => ({}))) as { detail?: string } & Partial<DashboardSummary>;
      if (!response.ok) {
        if (response.status === 401) {
          window.location.assign("/login?next=/");
          return;
        }
        throw new Error(body.detail || "Failed to load dashboard summary.");
      }
      setSummary(body as DashboardSummary);
    } catch (error) {
      setSummary(null);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load dashboard summary.");
    } finally {
      if (initialLoad) {
        setIsLoading(false);
      } else {
        setIsRefreshing(false);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadWithCancellation() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const response = await fetch(`/api/dashboard/summary?window=${encodeURIComponent(windowValue)}`, {
          cache: "no-store"
        });
        const body = (await response.json().catch(() => ({}))) as { detail?: string } & Partial<DashboardSummary>;
        if (!response.ok) {
          if (response.status === 401) {
            window.location.assign("/login?next=/");
            return;
          }
          throw new Error(body.detail || "Failed to load dashboard summary.");
        }
        if (!cancelled) {
          setSummary(body as DashboardSummary);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load dashboard summary.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadWithCancellation();
    return () => {
      cancelled = true;
    };
  }, [windowValue]);

  if (isLoading) {
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">Loading KPI summary...</p>
      </Card>
    );
  }

  if (errorMessage) {
    return (
      <Card className="border-destructive bg-destructive/10 p-6">
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-2 text-sm text-destructive">{errorMessage}</p>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">No dashboard summary is available yet.</p>
      </Card>
    );
  }

  const kpiCards = [
    {
      title: "Ingestion volume",
      value: summary.kpis.ingested_lines.toLocaleString(),
      caption: `${summary.kpis.sources_ingested} sources ingested`
    },
    {
      title: "Analysis success rate",
      value: `${summary.kpis.success_rate.toFixed(2)}%`,
      caption: `${summary.kpis.analyses_completed}/${summary.kpis.analyses_total} completed`
    },
    {
      title: "Analysis failure rate",
      value: `${summary.kpis.failure_rate.toFixed(2)}%`,
      caption: `${summary.kpis.analyses_failed} failed analyses`
    },
    {
      title: "Error lines",
      value: summary.kpis.error_lines.toLocaleString(),
      caption: "Detected error/fatal lines"
    }
  ];

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Rolling summary for {windowValue}. Generated at {formatDate(summary.generated_at)}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs uppercase tracking-[0.1em] text-muted-foreground" htmlFor="dashboard-window">
              Range
            </label>
            <select
              id="dashboard-window"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
              value={windowValue}
              onChange={(event) => setWindowValue(event.target.value as (typeof WINDOW_OPTIONS)[number]["value"])}
              aria-label="Select dashboard time range"
            >
              {WINDOW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              className="h-10 text-sm"
              onClick={() => loadSummary(windowValue, false)}
              disabled={isRefreshing || isLoading}
              aria-label="Refresh dashboard summary"
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.title} className="p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{kpi.title}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{kpi.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{kpi.caption}</p>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground">Top error clusters</h2>
          {summary.top_clusters.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              No clusters found in this window.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-[0.1em] text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Cluster</th>
                    <th className="px-2 py-2 font-medium">Events</th>
                    <th className="px-2 py-2 font-medium">Analyses</th>
                    <th className="px-2 py-2 font-medium">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.top_clusters.map((cluster) => (
                    <tr key={cluster.fingerprint} className="border-b border-border/50 last:border-0">
                      <td className="px-2 py-2 text-foreground">{cluster.title}</td>
                      <td className="px-2 py-2 text-muted-foreground">{cluster.total_events}</td>
                      <td className="px-2 py-2 text-muted-foreground">{cluster.analyses}</td>
                      <td className="px-2 py-2 text-muted-foreground">{formatDate(cluster.last_seen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground">Recent jobs</h2>
          {summary.recent_jobs.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              No analysis jobs in this window.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-[0.1em] text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Job</th>
                    <th className="px-2 py-2 font-medium">Source</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recent_jobs.map((job) => (
                    <tr key={job.id} className="border-b border-border/50 last:border-0">
                      <td className="px-2 py-2">
                        <Link className="text-primary underline-offset-4 hover:underline" href={`/analyses/${job.id}`}>
                          #{job.id}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">{job.source_name}</td>
                      <td className="px-2 py-2 text-muted-foreground">{job.status}</td>
                      <td className="px-2 py-2 text-muted-foreground">{job.error_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

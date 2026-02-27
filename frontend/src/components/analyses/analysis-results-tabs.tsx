"use client";

import { useState } from "react";

import { Card } from "@/components/ui/card";

type AnalysisSummary = {
  id: number;
  status: string;
  stats: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  ai_insight: {
    executive_summary: string;
    overall_confidence: number | null;
    evidence_references: number[];
    updated_at: string;
  } | null;
};

type ClusterItem = {
  id: number;
  title: string;
  count: number;
  fingerprint: string;
  first_seen: string | null;
  last_seen: string | null;
  sample_events: number[];
  affected_services: string[];
};

type TabKey = "summary" | "clusters" | "timeline";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "summary", label: "Summary" },
  { key: "clusters", label: "Clusters" },
  { key: "timeline", label: "Timeline" }
];

function readStatsNumber(stats: Record<string, unknown>, key: string) {
  const value = stats[key];
  if (typeof value === "number") {
    return value;
  }
  return 0;
}

function formatClusterTime(value: string | null) {
  if (!value) {
    return "n/a";
  }
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return "n/a";
  }
  return timestamp.toLocaleString();
}

type TimelinePoint = {
  hour: string;
  totalEvents: number;
};

function buildTimelinePoints(clusters: ClusterItem[]): TimelinePoint[] {
  const buckets = new Map<string, number>();
  for (const cluster of clusters) {
    if (!cluster.first_seen) {
      continue;
    }

    const timestamp = new Date(cluster.first_seen);
    if (Number.isNaN(timestamp.getTime())) {
      continue;
    }

    const hourKey = timestamp.toISOString().slice(0, 13);
    buckets.set(hourKey, (buckets.get(hourKey) || 0) + cluster.count);
  }

  return Array.from(buckets.entries())
    .sort(([hourA], [hourB]) => (hourA < hourB ? -1 : hourA > hourB ? 1 : 0))
    .map(([hour, totalEvents]) => ({ hour, totalEvents }));
}

function formatHourLabel(hourKey: string) {
  const timestamp = new Date(`${hourKey}:00:00.000Z`);
  if (Number.isNaN(timestamp.getTime())) {
    return hourKey;
  }
  return timestamp.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function AnalysisResultsTabs({ analysisId }: { analysisId: string }) {
  const [accessToken, setAccessToken] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null);
  const [clusters, setClusters] = useState<ClusterItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const timelinePoints = buildTimelinePoints(clusters);
  const maxTimelineEvents =
    timelinePoints.length > 0
      ? timelinePoints.reduce((maxValue, point) => Math.max(maxValue, point.totalEvents), 0)
      : 0;

  async function loadAnalysis() {
    if (!accessToken.trim()) {
      setErrorMessage("Access token is required.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    try {
      const [analysisResponse, clustersResponse] = await Promise.all([
        fetch(`/api/analyses/${analysisId}`, {
          headers: {
            "x-access-token": accessToken.trim()
          }
        }),
        fetch(`/api/analyses/${analysisId}/clusters`, {
          headers: {
            "x-access-token": accessToken.trim()
          }
        })
      ]);

      const analysisBody = await analysisResponse.json();
      if (!analysisResponse.ok) {
        setErrorMessage(analysisBody.detail || "Failed to fetch analysis summary.");
        return;
      }

      const clustersBody = await clustersResponse.json();
      if (!clustersResponse.ok) {
        setErrorMessage(clustersBody.detail || "Failed to fetch analysis clusters.");
        return;
      }

      setAnalysis(analysisBody);
      setClusters(Array.isArray(clustersBody) ? clustersBody : []);
    } catch {
      setErrorMessage("Unable to load analysis data.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div>
          <h3 className="text-sm font-semibold">Load analysis</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter a JWT access token, then load analysis `{analysisId}`.
          </p>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="block w-full text-sm text-muted-foreground">
            Access token
            <input
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              type="password"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder="eyJ..."
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            className="rounded-lg border border-primary bg-primary/20 px-4 py-2 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
            disabled={isLoading}
            onClick={loadAnalysis}
          >
            {isLoading ? "Loading..." : "Load"}
          </button>
        </div>
      </Card>

      {errorMessage && (
        <Card className="border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">Error: {errorMessage}</p>
        </Card>
      )}

      {!analysis && !isLoading && !errorMessage && (
        <Card className="border-dashed p-4">
          <p className="text-sm text-muted-foreground">
            Empty state: no analysis loaded yet. Provide token and click Load.
          </p>
        </Card>
      )}

      {analysis && (
        <>
          <Card className="p-2">
            <div className="grid gap-2 sm:grid-cols-3">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`rounded-lg px-3 py-2 text-sm ${
                    activeTab === tab.key
                      ? "border border-primary bg-primary/15 text-foreground"
                      : "border border-transparent bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </Card>

          {activeTab === "summary" && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold">Summary</h3>
              <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                <p>Status: {analysis.status}</p>
                <p>Total lines: {readStatsNumber(analysis.stats, "total_lines")}</p>
                <p>Error count: {readStatsNumber(analysis.stats, "error_count")}</p>
              </div>
              {analysis.ai_insight?.executive_summary ? (
                <div className="mt-4 space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Executive Summary</p>
                  <p className="text-sm text-foreground">{analysis.ai_insight.executive_summary}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <p>
                      Confidence:{" "}
                      {typeof analysis.ai_insight.overall_confidence === "number"
                        ? `${Math.round(analysis.ai_insight.overall_confidence * 100)}%`
                        : "n/a"}
                    </p>
                    <p>Evidence refs: {analysis.ai_insight.evidence_references?.length || 0}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-4 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  Empty state: no executive summary available for this analysis.
                </p>
              )}
            </Card>
          )}

          {activeTab === "clusters" && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold">Clusters</h3>
              {clusters.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Empty state: no clusters available for this analysis.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Top error clusters ranked by frequency.
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted/50 text-left text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Cluster</th>
                          <th className="px-3 py-2 font-medium">Events</th>
                          <th className="px-3 py-2 font-medium">Fingerprint</th>
                          <th className="px-3 py-2 font-medium">Window</th>
                          <th className="px-3 py-2 font-medium">Services</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {clusters.slice(0, 25).map((cluster) => (
                          <tr key={cluster.id} className="bg-background text-foreground">
                            <td className="px-3 py-2 align-top">
                              <p className="font-medium">#{cluster.id}</p>
                              <p className="text-muted-foreground">{cluster.title}</p>
                            </td>
                            <td className="px-3 py-2 align-top text-muted-foreground">{cluster.count}</td>
                            <td className="px-3 py-2 align-top text-muted-foreground">
                              <code className="rounded bg-muted px-1 py-0.5 text-xs">{cluster.fingerprint}</code>
                            </td>
                            <td className="px-3 py-2 align-top text-muted-foreground">
                              {formatClusterTime(cluster.first_seen)} to {formatClusterTime(cluster.last_seen)}
                            </td>
                            <td className="px-3 py-2 align-top text-muted-foreground">
                              {cluster.affected_services?.length
                                ? cluster.affected_services.join(", ")
                                : "unassigned"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Showing {Math.min(clusters.length, 25)} of {clusters.length} clusters.
                  </p>
                </div>
              )}
            </Card>
          )}

          {activeTab === "timeline" && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold">Timeline</h3>
              <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                <p>Started: {formatClusterTime(analysis.started_at)}</p>
                <p>Finished: {formatClusterTime(analysis.finished_at)}</p>
                <p>Clusters: {clusters.length}</p>
              </div>
              {timelinePoints.length === 0 ? (
                <p className="mt-4 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  Empty state: no timestamped clusters available to render a spike timeline.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Event spikes by hour (derived from cluster first-seen timestamps).
                  </p>
                  <div className="space-y-2">
                    {timelinePoints.map((point) => {
                      const barWidth =
                        maxTimelineEvents > 0 ? `${Math.max((point.totalEvents / maxTimelineEvents) * 100, 8)}%` : "8%";
                      return (
                        <div key={point.hour} className="grid gap-2 sm:grid-cols-[180px_1fr_60px] sm:items-center">
                          <p className="text-xs text-muted-foreground">{formatHourLabel(point.hour)}</p>
                          <div className="h-3 rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary/70" style={{ width: barWidth }} />
                          </div>
                          <p className="text-right text-xs text-muted-foreground">{point.totalEvents}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

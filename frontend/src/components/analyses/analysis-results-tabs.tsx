"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

type EventItem = {
  id: number;
  line_no: number;
  timestamp: string | null;
  level: string;
  service: string;
  message: string;
  trace_id: string | null;
  request_id: string | null;
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

function maskSensitiveText(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\b(?:\d[ -]*?){13,16}\b/g, "[REDACTED_CARD]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[REDACTED_IP]")
    .replace(/Bearer\s+[A-Za-z0-9\-_\.]+/gi, "Bearer [REDACTED_TOKEN]")
    .replace(/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "[REDACTED_SECRET]");
}

export function AnalysisResultsTabs({ analysisId }: { analysisId: string }) {
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null);
  const [clusters, setClusters] = useState<ClusterItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [eventQuery, setEventQuery] = useState("");
  const [eventLevel, setEventLevel] = useState("");
  const [eventService, setEventService] = useState("");
  const [isEventsLoading, setIsEventsLoading] = useState(false);
  const [eventsErrorMessage, setEventsErrorMessage] = useState("");
  const [downloadErrorMessage, setDownloadErrorMessage] = useState("");
  const [downloadingFormat, setDownloadingFormat] = useState<"json" | "md" | null>(null);
  const timelinePoints = buildTimelinePoints(clusters);
  const maxTimelineEvents =
    timelinePoints.length > 0
      ? timelinePoints.reduce((maxValue, point) => Math.max(maxValue, point.totalEvents), 0)
      : 0;

  async function downloadExport(format: "json" | "md") {
    setDownloadingFormat(format);
    setDownloadErrorMessage("");
    try {
      const path = format === "json" ? "export-json" : "export-md";
      const response = await fetch(`/api/analyses/${analysisId}/${path}`);

      if (!response.ok) {
        let detail = "Export request failed.";
        try {
          const body = await response.json();
          if (body?.detail) {
            detail = String(body.detail);
          }
        } catch {
          detail = "Export request failed.";
        }
        setDownloadErrorMessage(detail);
        return;
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") || "";
      const filenameMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
      const fallback = format === "json" ? `analysis-${analysisId}-export.json` : `analysis-${analysisId}-report.md`;
      const filename = filenameMatch?.[1] || fallback;

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      setDownloadErrorMessage("Unable to download export.");
    } finally {
      setDownloadingFormat(null);
    }
  }

  async function loadEvents(filters?: { query?: string; level?: string; service?: string }) {
    setIsEventsLoading(true);
    setEventsErrorMessage("");
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      const query = filters?.query ?? eventQuery.trim();
      const level = filters?.level ?? eventLevel;
      const service = filters?.service ?? eventService.trim();

      if (query) {
        params.set("q", query);
      }
      if (level) {
        params.set("level", level);
      }
      if (service) {
        params.set("service", service);
      }

      const response = await fetch(`/api/analyses/${analysisId}/events?${params.toString()}`);
      const body = await response.json();
      if (!response.ok) {
        setEventsErrorMessage(body.detail || "Failed to fetch events.");
        setEvents([]);
        return;
      }
      setEvents(Array.isArray(body) ? body : []);
    } catch {
      setEventsErrorMessage("Unable to load events.");
      setEvents([]);
    } finally {
      setIsEventsLoading(false);
    }
  }

  async function loadAnalysis() {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const [analysisResponse, clustersResponse] = await Promise.all([
        fetch(`/api/analyses/${analysisId}`),
        fetch(`/api/analyses/${analysisId}/clusters`)
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
      await loadEvents({ query: "", level: "", service: "" });
    } catch {
      setErrorMessage("Unable to load analysis data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId]);

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div>
          <h3 className="text-sm font-semibold">Analysis data</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Analysis `{analysisId}` is loaded using your active authenticated session.
          </p>
        </div>
        <div>
          <button
            type="button"
            className="rounded-lg border border-primary bg-primary/20 px-4 py-2 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
            disabled={isLoading}
            onClick={loadAnalysis}
          >
            {isLoading ? "Refreshing..." : "Refresh"}
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
            Empty state: no analysis loaded yet.
          </p>
        </Card>
      )}

      {analysis && (
        <>
          <Card className="p-4">
            <h3 className="text-sm font-semibold">Exports</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Download analysis artifacts for incident sharing and handoff.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-primary bg-primary/20 px-4 py-2 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
                disabled={downloadingFormat !== null}
                onClick={() => downloadExport("json")}
              >
                {downloadingFormat === "json" ? "Downloading JSON..." : "Download JSON"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-primary bg-primary/20 px-4 py-2 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
                disabled={downloadingFormat !== null}
                onClick={() => downloadExport("md")}
              >
                {downloadingFormat === "md" ? "Downloading Markdown..." : "Download Markdown"}
              </button>
            </div>
            {downloadErrorMessage && (
              <p className="mt-3 rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Error: {downloadErrorMessage}
              </p>
            )}
          </Card>

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
                              <Link
                                href={`/clusters/${cluster.id}`}
                                className="text-xs text-primary transition hover:text-primary/80"
                              >
                                View details
                              </Link>
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

          <Card className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="text-sm font-semibold">Search Events</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Filter normalized events by message text, level, and service.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-primary bg-primary/20 px-4 py-2 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
                disabled={isEventsLoading}
                onClick={() =>
                  loadEvents({
                    query: eventQuery.trim(),
                    level: eventLevel,
                    service: eventService.trim()
                  })
                }
              >
                {isEventsLoading ? "Searching..." : "Apply filters"}
              </button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="text-sm text-muted-foreground">
                Search text
                <input
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  value={eventQuery}
                  onChange={(event) => setEventQuery(event.target.value)}
                  placeholder="timeout, exception, trace id..."
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Level
                <select
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  value={eventLevel}
                  onChange={(event) => setEventLevel(event.target.value)}
                >
                  <option value="">All levels</option>
                  <option value="debug">debug</option>
                  <option value="info">info</option>
                  <option value="warn">warn</option>
                  <option value="error">error</option>
                  <option value="fatal">fatal</option>
                  <option value="unknown">unknown</option>
                </select>
              </label>
              <label className="text-sm text-muted-foreground">
                Service
                <input
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  value={eventService}
                  onChange={(event) => setEventService(event.target.value)}
                  placeholder="api, worker, nginx..."
                />
              </label>
            </div>

            {eventsErrorMessage && (
              <p className="mt-3 rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Error: {eventsErrorMessage}
              </p>
            )}

            {isEventsLoading ? (
              <p className="mt-3 text-sm text-muted-foreground">Loading filtered events...</p>
            ) : events.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Empty state: no events match the current filters.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Line</th>
                      <th className="px-3 py-2 font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Level</th>
                      <th className="px-3 py-2 font-medium">Service</th>
                      <th className="px-3 py-2 font-medium">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {events.map((event) => (
                      <tr key={event.id} className="bg-background align-top">
                        <td className="px-3 py-2 text-muted-foreground">{event.line_no}</td>
                        <td className="px-3 py-2 text-muted-foreground">{formatClusterTime(event.timestamp)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{event.level}</td>
                        <td className="px-3 py-2 text-muted-foreground">{event.service || "n/a"}</td>
                        <td className="px-3 py-2 text-foreground">{maskSensitiveText(event.message || "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

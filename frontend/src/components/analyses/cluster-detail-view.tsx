"use client";

import { useState } from "react";

import { Card } from "@/components/ui/card";

type ClusterSampleEvent = {
  line_no: number;
  level: string;
  service: string;
  message: string;
};

type ClusterDetail = {
  id: number;
  analysis_id: number;
  fingerprint: string;
  title: string;
  count: number;
  first_seen: string | null;
  last_seen: string | null;
  sample_events: number[];
  affected_services: string[];
  sample_log_events: ClusterSampleEvent[];
};

function formatTimestamp(value: string | null) {
  if (!value) {
    return "n/a";
  }
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return "n/a";
  }
  return timestamp.toLocaleString();
}

function maskSensitiveText(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\b(?:\d[ -]*?){13,16}\b/g, "[REDACTED_CARD]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[REDACTED_IP]")
    .replace(/Bearer\s+[A-Za-z0-9\-_\.]+/gi, "Bearer [REDACTED_TOKEN]")
    .replace(/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "[REDACTED_SECRET]");
}

export function ClusterDetailView({ clusterId }: { clusterId: string }) {
  const [accessToken, setAccessToken] = useState("");
  const [cluster, setCluster] = useState<ClusterDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadCluster() {
    if (!accessToken.trim()) {
      setErrorMessage("Access token is required.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/clusters/${clusterId}`, {
        headers: {
          "x-access-token": accessToken.trim()
        }
      });
      const body = await response.json();
      if (!response.ok) {
        setErrorMessage(body.detail || "Failed to fetch cluster detail.");
        return;
      }
      setCluster(body);
    } catch {
      setErrorMessage("Unable to load cluster detail.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div>
          <h3 className="text-sm font-semibold">Load cluster detail</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter a JWT access token, then load cluster `{clusterId}`.
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
            onClick={loadCluster}
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

      {!cluster && !isLoading && !errorMessage && (
        <Card className="border-dashed p-4">
          <p className="text-sm text-muted-foreground">
            Empty state: no cluster detail loaded yet. Provide token and click Load.
          </p>
        </Card>
      )}

      {cluster && (
        <>
          <Card className="p-4">
            <h3 className="text-sm font-semibold">Cluster #{cluster.id}</h3>
            <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
              <p>Analysis: {cluster.analysis_id}</p>
              <p>Events: {cluster.count}</p>
              <p>First seen: {formatTimestamp(cluster.first_seen)}</p>
              <p>Last seen: {formatTimestamp(cluster.last_seen)}</p>
            </div>
            <div className="mt-3 space-y-2">
              <p className="text-sm text-foreground">{cluster.title}</p>
              <p className="text-xs text-muted-foreground">
                Fingerprint: <code className="rounded bg-muted px-1 py-0.5">{cluster.fingerprint}</code>
              </p>
              <p className="text-xs text-muted-foreground">
                Services: {cluster.affected_services?.length ? cluster.affected_services.join(", ") : "unassigned"}
              </p>
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-semibold">Sample log events</h3>
            {cluster.sample_log_events?.length ? (
              <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Line</th>
                      <th className="px-3 py-2 font-medium">Level</th>
                      <th className="px-3 py-2 font-medium">Service</th>
                      <th className="px-3 py-2 font-medium">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cluster.sample_log_events.map((event) => (
                      <tr key={event.line_no} className="bg-background align-top">
                        <td className="px-3 py-2 text-muted-foreground">{event.line_no}</td>
                        <td className="px-3 py-2 text-muted-foreground">{event.level || "unknown"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{event.service || "n/a"}</td>
                        <td className="px-3 py-2 text-foreground">{maskSensitiveText(event.message || "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Empty state: no sample log events available for this cluster.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

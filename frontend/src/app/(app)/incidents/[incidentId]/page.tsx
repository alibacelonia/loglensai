"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";

type LinkedCluster = {
  id: number;
  fingerprint: string;
  title: string;
  count: number;
  first_seen: string | null;
  last_seen: string | null;
};

type TimelineEntry = {
  label: string;
  timestamp: string | null;
  detail: string;
};

type IncidentDetailPayload = {
  id: number;
  title: string;
  summary: string;
  status: string;
  severity: string;
  owner_display: string;
  remediation_notes: string;
  timeline: TimelineEntry[];
  linked_clusters: LinkedCluster[];
  created_at: string;
  updated_at: string;
};

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

export default function IncidentDetailPage({ params }: { params: Promise<{ incidentId: string }> }) {
  const [incidentId, setIncidentId] = useState<string>("");
  const [detail, setDetail] = useState<IncidentDetailPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    params.then((value) => setIncidentId(value.incidentId));
  }, [params]);

  useEffect(() => {
    if (!incidentId) {
      return;
    }
    let cancelled = false;

    async function loadDetail() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const response = await fetch(`/api/incidents/${incidentId}`, { cache: "no-store" });
        const body = (await response.json().catch(() => ({}))) as { detail?: string } & Partial<IncidentDetailPayload>;
        if (!response.ok) {
          throw new Error(body.detail || "Failed to load incident detail.");
        }
        if (!cancelled) {
          setDetail(body as IncidentDetailPayload);
        }
      } catch (error) {
        if (!cancelled) {
          setDetail(null);
          setErrorMessage(error instanceof Error ? error.message : "Failed to load incident detail.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [incidentId]);

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-foreground">Incident Detail</h1>
        {detail ? (
          <p className="mt-2 text-sm text-muted-foreground">
            #{detail.id} {detail.title} · {detail.status} · {detail.severity}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Inspect timeline, linked clusters, and remediation notes.</p>
        )}
      </Card>

      {isLoading ? (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Loading incident detail...</p>
        </Card>
      ) : null}

      {!isLoading && errorMessage ? (
        <Card className="border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{errorMessage}</p>
        </Card>
      ) : null}

      {detail ? (
        <>
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground">Remediation Notes</h2>
            <p className="mt-2 text-sm text-muted-foreground">{detail.remediation_notes || "No notes yet."}</p>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground">Timeline</h2>
            {detail.timeline.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No timeline entries available.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {detail.timeline.map((entry, index) => (
                  <li key={`${entry.label}-${index}`} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <p className="font-medium text-foreground">{entry.label}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(entry.timestamp)} · {entry.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground">Linked Clusters</h2>
            {detail.linked_clusters.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No linked clusters for this incident.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-[0.1em] text-muted-foreground">
                      <th className="px-2 py-2 font-medium">Cluster</th>
                      <th className="px-2 py-2 font-medium">Events</th>
                      <th className="px-2 py-2 font-medium">First seen</th>
                      <th className="px-2 py-2 font-medium">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.linked_clusters.map((cluster) => (
                      <tr key={cluster.id} className="border-b border-border/40 last:border-0">
                        <td className="px-2 py-2 text-foreground">{cluster.title}</td>
                        <td className="px-2 py-2 text-muted-foreground">{cluster.count}</td>
                        <td className="px-2 py-2 text-muted-foreground">{formatDate(cluster.first_seen)}</td>
                        <td className="px-2 py-2 text-muted-foreground">{formatDate(cluster.last_seen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type AnomalyGroup = {
  fingerprint: string;
  service: string;
  score: number;
  total_events: number;
  analyses: number;
  first_seen: string | null;
  last_seen: string | null;
  status: string;
  reviewed_at?: string | null;
};

type AnomalyEvidenceEvent = {
  id: number;
  analysis_id: number;
  source_id: number;
  source_name: string;
  timestamp: string | null;
  level: string;
  service: string;
  message: string;
  line_no: number;
};

type AnomalyDetail = {
  fingerprint: string;
  service: string;
  score: number;
  total_events: number;
  analyses: number;
  first_seen: string | null;
  last_seen: string | null;
  status: string;
  reviewed_at: string | null;
  evidence_events: AnomalyEvidenceEvent[];
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

export default function AnomaliesPage() {
  const [groups, setGroups] = useState<AnomalyGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<AnomalyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadGroups() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const response = await fetch("/api/anomalies", { cache: "no-store" });
        const body = (await response.json().catch(() => ({}))) as { detail?: string } | AnomalyGroup[];
        if (!response.ok) {
          if (response.status === 401) {
            window.location.assign("/login?next=/anomalies");
            return;
          }
          throw new Error((body as { detail?: string }).detail || "Failed to load anomalies.");
        }
        if (!cancelled) {
          setGroups(Array.isArray(body) ? body : []);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load anomalies.");
          setGroups([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadGroups();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadDetail(group: AnomalyGroup) {
    const key = `${group.fingerprint}:${group.service}`;
    setSelectedKey(key);
    setDetailLoading(true);
    setErrorMessage("");
    try {
      const query = group.service ? `?service=${encodeURIComponent(group.service)}` : "";
      const response = await fetch(`/api/anomalies/${group.fingerprint}${query}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { detail?: string } & Partial<AnomalyDetail>;
      if (!response.ok) {
        throw new Error(body.detail || "Failed to load anomaly details.");
      }
      setDetail(body as AnomalyDetail);
    } catch (error) {
      setDetail(null);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load anomaly details.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function markReviewed(group: AnomalyGroup) {
    const key = `${group.fingerprint}:${group.service}`;
    setActionLoadingKey(key);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/anomalies/${group.fingerprint}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ service: group.service, status: "reviewed" })
      });
      const body = (await response.json().catch(() => ({}))) as { detail?: string };
      if (!response.ok) {
        throw new Error(body.detail || "Failed to update anomaly review state.");
      }
      setGroups((current) =>
        current.map((item) =>
          item.fingerprint === group.fingerprint && item.service === group.service
            ? { ...item, status: "reviewed", reviewed_at: new Date().toISOString() }
            : item
        )
      );
      if (detail && detail.fingerprint === group.fingerprint && detail.service === group.service) {
        setDetail({ ...detail, status: "reviewed", reviewed_at: new Date().toISOString() });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update anomaly review state.");
    } finally {
      setActionLoadingKey(null);
    }
  }

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold text-foreground">Anomalies</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Confidence-scored anomaly groups across your analyses with first/last seen windows.
      </p>

      {isLoading ? (
        <p className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Loading anomaly groups...
        </p>
      ) : null}

      {!isLoading && errorMessage ? (
        <p className="mt-4 rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {!isLoading && !errorMessage && groups.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          No anomaly groups found yet.
        </p>
      ) : null}

      {!isLoading && groups.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-[0.1em] text-muted-foreground">
                <th className="px-2 py-2 font-medium">Score</th>
                <th className="px-2 py-2 font-medium">Service</th>
                <th className="px-2 py-2 font-medium">Events</th>
                <th className="px-2 py-2 font-medium">Analyses</th>
                <th className="px-2 py-2 font-medium">First seen</th>
                <th className="px-2 py-2 font-medium">Last seen</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={`${group.fingerprint}:${group.service}`} className="border-b border-border/40 last:border-0">
                  <td className="px-2 py-2 text-foreground">{group.score.toFixed(2)}</td>
                  <td className="px-2 py-2 text-muted-foreground">{group.service}</td>
                  <td className="px-2 py-2 text-muted-foreground">{group.total_events}</td>
                  <td className="px-2 py-2 text-muted-foreground">{group.analyses}</td>
                  <td className="px-2 py-2 text-muted-foreground">{formatDate(group.first_seen)}</td>
                  <td className="px-2 py-2 text-muted-foreground">{formatDate(group.last_seen)}</td>
                  <td className="px-2 py-2 text-muted-foreground">{group.status}</td>
                  <td className="px-2 py-2">
                    <div className="flex min-w-[220px] flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => void loadDetail(group)}
                        aria-label={`View anomaly details for ${group.service}`}
                      >
                        Details
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 text-xs"
                        onClick={() => void markReviewed(group)}
                        disabled={group.status === "reviewed" || actionLoadingKey === `${group.fingerprint}:${group.service}`}
                        aria-label={`Mark anomaly ${group.service} as reviewed`}
                      >
                        {actionLoadingKey === `${group.fingerprint}:${group.service}` ? "Updating..." : "Mark reviewed"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selectedKey && detailLoading ? (
        <Card className="mt-4 p-4">
          <p className="text-sm text-muted-foreground">Loading anomaly details...</p>
        </Card>
      ) : null}

      {detail && !detailLoading ? (
        <Card className="mt-4 p-4">
          <h2 className="text-sm font-semibold text-foreground">Anomaly detail</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {detail.service} · score {detail.score.toFixed(2)} · status {detail.status}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Fingerprint: {detail.fingerprint}</p>
          <p className="mt-1 text-xs text-muted-foreground">Reviewed at: {formatDate(detail.reviewed_at)}</p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-[0.1em] text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Time</th>
                  <th className="px-2 py-2 font-medium">Level</th>
                  <th className="px-2 py-2 font-medium">Source</th>
                  <th className="px-2 py-2 font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {detail.evidence_events.map((event) => (
                  <tr key={event.id} className="border-b border-border/40 align-top last:border-0">
                    <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{formatDate(event.timestamp)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{event.level}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{event.source_name}</td>
                    <td className="px-2 py-2 font-mono text-xs text-foreground">{event.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </Card>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type SourceRecord = {
  id: number;
  name: string;
  type: string;
  file_object_key: string | null;
  created_at: string;
  updated_at: string;
};

type AnalysisRecord = {
  id: number;
  status: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }
  return date.toLocaleString();
}

export function LatestUploadedSourcesTable() {
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [selectedSource, setSelectedSource] = useState<SourceRecord | null>(null);
  const [activeActionSourceId, setActiveActionSourceId] = useState<number | null>(null);

  const latestSources = useMemo(() => sources.slice(0, 10), [sources]);

  const loadSources = useCallback(async () => {
    setErrorMessage("");
    setActionMessage("");
    try {
      const response = await fetch("/api/sources", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { detail?: string } | SourceRecord[];
      if (!response.ok) {
        if (response.status === 401) {
          window.location.assign("/login?next=/upload-logs");
          return;
        }
        throw new Error((body as { detail?: string }).detail || "Failed to load latest sources.");
      }
      setSources(Array.isArray(body) ? body : []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load latest sources.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  useEffect(() => {
    const handleSourceChanged = () => {
      void loadSources();
    };
    window.addEventListener("sources:changed", handleSourceChanged);
    return () => {
      window.removeEventListener("sources:changed", handleSourceChanged);
    };
  }, [loadSources]);

  async function handleAnalyze(sourceId: number) {
    setActiveActionSourceId(sourceId);
    setErrorMessage("");
    setActionMessage("");
    try {
      const response = await fetch(`/api/sources/${sourceId}/analyze`, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { detail?: string } & Partial<AnalysisRecord>;
      if (!response.ok) {
        throw new Error(body.detail || "Failed to queue analysis.");
      }
      const analysisId = body.id ? `#${body.id}` : "job";
      setActionMessage(`Queued analysis ${analysisId} for source ${sourceId}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to queue analysis.");
    } finally {
      setActiveActionSourceId(null);
    }
  }

  async function handleViewDetails(sourceId: number) {
    setActiveActionSourceId(sourceId);
    setErrorMessage("");
    setActionMessage("");
    try {
      const response = await fetch(`/api/sources/${sourceId}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { detail?: string } & Partial<SourceRecord>;
      if (!response.ok) {
        throw new Error(body.detail || "Failed to load source details.");
      }
      setSelectedSource(body as SourceRecord);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load source details.");
    } finally {
      setActiveActionSourceId(null);
    }
  }

  async function handleDelete(sourceId: number) {
    const shouldDelete = window.confirm(`Delete source ${sourceId}? This cannot be undone.`);
    if (!shouldDelete) {
      return;
    }

    setActiveActionSourceId(sourceId);
    setErrorMessage("");
    setActionMessage("");
    try {
      const response = await fetch(`/api/sources/${sourceId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body.detail || "Failed to delete source.");
      }
      setSources((current) => current.filter((source) => source.id !== sourceId));
      window.dispatchEvent(new Event("sources:changed"));
      if (selectedSource?.id === sourceId) {
        setSelectedSource(null);
      }
      setActionMessage(`Deleted source ${sourceId}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete source.");
    } finally {
      setActiveActionSourceId(null);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Latest uploaded sources</h2>
          <p className="mt-1 text-xs text-muted-foreground">Quick actions: analyze, view details, and delete.</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void loadSources()}>
          Refresh list
        </Button>
      </div>

      {isLoading ? (
        <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Loading latest sources...
        </p>
      ) : null}

      {!isLoading && errorMessage ? (
        <p className="mt-3 rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {!isLoading && !errorMessage && latestSources.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          No uploaded sources yet. Use the form above to create one.
        </p>
      ) : null}

      {!isLoading && latestSources.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-[0.1em] text-muted-foreground">
                <th className="px-2 py-2 font-medium">ID</th>
                <th className="px-2 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Type</th>
                <th className="px-2 py-2 font-medium">Created</th>
                <th className="px-2 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {latestSources.map((source) => (
                <tr key={source.id} className="border-b border-border/50 align-top last:border-0">
                  <td className="px-2 py-2 text-muted-foreground">{source.id}</td>
                  <td className="px-2 py-2 text-foreground">{source.name}</td>
                  <td className="px-2 py-2 text-muted-foreground">{source.type}</td>
                  <td className="px-2 py-2 text-muted-foreground">{formatDate(source.created_at)}</td>
                  <td className="px-2 py-2">
                    <div className="flex min-w-[250px] flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 text-xs"
                        onClick={() => void handleAnalyze(source.id)}
                        disabled={activeActionSourceId === source.id}
                        aria-label={`Analyze source ${source.id}`}
                      >
                        Analyze
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => void handleViewDetails(source.id)}
                        disabled={activeActionSourceId === source.id}
                        aria-label={`View source ${source.id} details`}
                      >
                        View details
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 border-destructive/40 bg-destructive/10 text-xs text-destructive hover:bg-destructive/20"
                        onClick={() => void handleDelete(source.id)}
                        disabled={activeActionSourceId === source.id}
                        aria-label={`Delete source ${source.id}`}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {actionMessage ? (
        <p className="mt-3 rounded-lg border border-success bg-success/10 px-3 py-2 text-sm text-foreground">
          {actionMessage}
        </p>
      ) : null}

      {selectedSource ? (
        <Card className="mt-3 p-3">
          <h3 className="text-sm font-semibold text-foreground">Source details</h3>
          <dl className="mt-2 grid gap-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Source</dt>
              <dd className="text-foreground">
                #{selectedSource.id} · {selectedSource.name}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Type</dt>
              <dd className="text-foreground">{selectedSource.type}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Object key</dt>
              <dd className="break-all text-muted-foreground">{selectedSource.file_object_key || "n/a"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Created</dt>
              <dd className="text-muted-foreground">{formatDate(selectedSource.created_at)}</dd>
            </div>
          </dl>
          <div className="mt-3">
            <Link href={`/analyses`} className="text-xs text-primary underline-offset-4 hover:underline">
              Open analyses
            </Link>
          </div>
        </Card>
      ) : null}
    </Card>
  );
}

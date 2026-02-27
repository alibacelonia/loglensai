"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type IncidentRecord = {
  id: number;
  title: string;
  summary: string;
  status: string;
  severity: string;
  owner_display: string;
  analysis_id: number | null;
  source_name: string | null;
  remediation_notes: string;
  created_at: string;
  updated_at: string;
};

type IncidentListResponse = {
  count: number;
  page: number;
  page_size: number;
  results: IncidentRecord[];
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

export default function IncidentsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<IncidentListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadIncidents() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("page_size", "20");
        if (statusFilter) {
          params.set("status", statusFilter);
        }
        if (severityFilter) {
          params.set("severity", severityFilter);
        }
        if (ownerFilter.trim()) {
          params.set("owner", ownerFilter.trim());
        }
        const response = await fetch(`/api/incidents?${params.toString()}`, { cache: "no-store" });
        const body = (await response.json().catch(() => ({}))) as { detail?: string } & Partial<IncidentListResponse>;
        if (!response.ok) {
          throw new Error(body.detail || "Failed to load incidents.");
        }
        if (!cancelled) {
          setData(body as IncidentListResponse);
        }
      } catch (error) {
        if (!cancelled) {
          setData(null);
          setErrorMessage(error instanceof Error ? error.message : "Failed to load incidents.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadIncidents();
    return () => {
      cancelled = true;
    };
  }, [page, statusFilter, severityFilter, ownerFilter]);

  const totalPages = data ? Math.max(1, Math.ceil(data.count / data.page_size)) : 1;

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold text-foreground">Incidents</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Track incident records with status/severity/owner filters and paginated results.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <label className="space-y-1 text-xs uppercase tracking-[0.1em] text-muted-foreground">
          Status
          <select
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            value={statusFilter}
            onChange={(event) => {
              setPage(1);
              setStatusFilter(event.target.value);
            }}
          >
            <option value="">all</option>
            <option value="open">open</option>
            <option value="investigating">investigating</option>
            <option value="resolved">resolved</option>
          </select>
        </label>

        <label className="space-y-1 text-xs uppercase tracking-[0.1em] text-muted-foreground">
          Severity
          <select
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            value={severityFilter}
            onChange={(event) => {
              setPage(1);
              setSeverityFilter(event.target.value);
            }}
          >
            <option value="">all</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
        </label>

        <label className="space-y-1 text-xs uppercase tracking-[0.1em] text-muted-foreground md:col-span-2">
          Owner
          <Input
            value={ownerFilter}
            onChange={(event) => {
              setPage(1);
              setOwnerFilter(event.target.value);
            }}
            className="h-11 text-sm"
            placeholder="Filter by assigned owner..."
          />
        </label>
      </div>

      {isLoading ? (
        <p className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Loading incidents...
        </p>
      ) : null}

      {!isLoading && errorMessage ? (
        <p className="mt-4 rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {!isLoading && data && data.results.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          No incidents found for current filters.
        </p>
      ) : null}

      {!isLoading && data && data.results.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-[0.1em] text-muted-foreground">
                <th className="px-2 py-2 font-medium">Incident</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Severity</th>
                <th className="px-2 py-2 font-medium">Owner</th>
                <th className="px-2 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((incident) => (
                <tr key={incident.id} className="border-b border-border/40 last:border-0">
                  <td className="px-2 py-2 text-foreground">
                    <Link href={`/incidents/${incident.id}`} className="text-primary underline-offset-4 hover:underline">
                      #{incident.id} {incident.title}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{incident.status}</td>
                  <td className="px-2 py-2 text-muted-foreground">{incident.severity}</td>
                  <td className="px-2 py-2 text-muted-foreground">{incident.owner_display || "unassigned"}</td>
                  <td className="px-2 py-2 text-muted-foreground">{formatDate(incident.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page {data?.page || page} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || isLoading}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={isLoading || page >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </Card>
  );
}

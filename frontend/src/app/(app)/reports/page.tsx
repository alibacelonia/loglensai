"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ReportRun = {
  id: number;
  analysis_id: number | null;
  format: "json" | "markdown";
  status: string;
  report_scope: Record<string, unknown>;
  created_at: string;
};

type ReportSchedule = {
  id: number;
  frequency: string;
  recipients: string;
  webhook_target: string;
  report_scope: Record<string, unknown>;
  enabled: boolean;
  updated_at: string;
};

type ReportsResponse = {
  history: ReportRun[];
  schedules: ReportSchedule[];
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

export default function ReportsPage() {
  const [data, setData] = useState<ReportsResponse>({ history: [], schedules: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [analysisIdInput, setAnalysisIdInput] = useState("");
  const [formatInput, setFormatInput] = useState<"json" | "markdown">("markdown");
  const [frequencyInput, setFrequencyInput] = useState("weekly");
  const [recipientsInput, setRecipientsInput] = useState("");
  const [webhookInput, setWebhookInput] = useState("");
  const [scopeInput, setScopeInput] = useState("{}");
  const [actionMessage, setActionMessage] = useState("");

  async function loadReports() {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/reports", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { detail?: string } & Partial<ReportsResponse>;
      if (!response.ok) {
        throw new Error(body.detail || "Failed to load reports.");
      }
      setData({
        history: Array.isArray(body.history) ? body.history : [],
        schedules: Array.isArray(body.schedules) ? body.schedules : []
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load reports.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, []);

  async function handleGenerateReport() {
    setErrorMessage("");
    setActionMessage("");
    const parsedAnalysisId = Number(analysisIdInput);
    if (!Number.isInteger(parsedAnalysisId) || parsedAnalysisId < 1) {
      setErrorMessage("analysis id must be a positive integer.");
      return;
    }
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ analysis_id: parsedAnalysisId, format: formatInput })
    });
    const body = (await response.json().catch(() => ({}))) as { detail?: string; download_path?: string };
    if (!response.ok) {
      setErrorMessage(body.detail || "Failed to generate report.");
      return;
    }
    setActionMessage("Report generated and added to history.");
    await loadReports();
  }

  async function handleRegenerate(reportId: number) {
    setErrorMessage("");
    setActionMessage("");
    const response = await fetch(`/api/reports/${reportId}/regenerate`, { method: "POST" });
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    if (!response.ok) {
      setErrorMessage(body.detail || "Failed to regenerate report.");
      return;
    }
    setActionMessage(`Report ${reportId} regenerated.`);
    await loadReports();
  }

  async function handleCreateSchedule() {
    setErrorMessage("");
    setActionMessage("");
    let parsedScope: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(scopeInput || "{}");
      parsedScope = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      setErrorMessage("report scope must be valid JSON.");
      return;
    }

    const response = await fetch("/api/report-schedules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        frequency: frequencyInput,
        recipients: recipientsInput,
        webhook_target: webhookInput,
        report_scope: parsedScope,
        enabled: true
      })
    });
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    if (!response.ok) {
      setErrorMessage(body.detail || "Failed to create schedule.");
      return;
    }
    setActionMessage("Schedule created.");
    await loadReports();
  }

  async function toggleSchedule(schedule: ReportSchedule) {
    const response = await fetch(`/api/report-schedules/${schedule.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !schedule.enabled })
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { detail?: string };
      setErrorMessage(body.detail || "Failed to update schedule.");
      return;
    }
    await loadReports();
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-foreground">Reports</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Report history with download/re-generate actions and scheduled report configuration.
        </p>
      </Card>

      {isLoading ? (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Loading reports...</p>
        </Card>
      ) : null}

      {errorMessage ? (
        <Card className="border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{errorMessage}</p>
        </Card>
      ) : null}

      {actionMessage ? (
        <Card className="border-success bg-success/10 p-4">
          <p className="text-sm text-foreground">{actionMessage}</p>
        </Card>
      ) : null}

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground">Generate report</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Input
            value={analysisIdInput}
            onChange={(event) => setAnalysisIdInput(event.target.value)}
            placeholder="Analysis ID"
            className="h-11 text-sm"
          />
          <select
            className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            value={formatInput}
            onChange={(event) => setFormatInput(event.target.value as "json" | "markdown")}
          >
            <option value="markdown">markdown</option>
            <option value="json">json</option>
          </select>
          <Button type="button" className="h-11 text-sm md:col-span-2" onClick={() => void handleGenerateReport()}>
            Generate
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground">Report history</h2>
        {data.history.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No generated reports yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-[0.1em] text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Report</th>
                  <th className="px-2 py-2 font-medium">Format</th>
                  <th className="px-2 py-2 font-medium">Created</th>
                  <th className="px-2 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((report) => (
                  <tr key={report.id} className="border-b border-border/40 last:border-0">
                    <td className="px-2 py-2 text-foreground">#{report.id} (analysis {report.analysis_id ?? "n/a"})</td>
                    <td className="px-2 py-2 text-muted-foreground">{report.format}</td>
                    <td className="px-2 py-2 text-muted-foreground">{formatDate(report.created_at)}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        {report.analysis_id ? (
                          <a
                            href={
                              report.format === "json"
                                ? `/api/analyses/${report.analysis_id}/export-json`
                                : `/api/analyses/${report.analysis_id}/export-md`
                            }
                            className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs text-foreground hover:bg-muted/60"
                          >
                            Download
                          </a>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => void handleRegenerate(report.id)}
                        >
                          Re-generate
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground">Scheduled reports</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <select
            className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            value={frequencyInput}
            onChange={(event) => setFrequencyInput(event.target.value)}
          >
            <option value="daily">daily</option>
            <option value="weekly">weekly</option>
            <option value="monthly">monthly</option>
          </select>
          <Input
            value={recipientsInput}
            onChange={(event) => setRecipientsInput(event.target.value)}
            placeholder="Recipients (comma-separated emails)"
            className="h-11 text-sm"
          />
          <Input
            value={webhookInput}
            onChange={(event) => setWebhookInput(event.target.value)}
            placeholder="Webhook target URL (optional)"
            className="h-11 text-sm"
          />
          <Input
            value={scopeInput}
            onChange={(event) => setScopeInput(event.target.value)}
            placeholder='Report scope JSON (e.g. {"services":["checkout"]})'
            className="h-11 text-sm"
          />
          <Button type="button" className="h-11 text-sm md:col-span-2" onClick={() => void handleCreateSchedule()}>
            Save schedule
          </Button>
        </div>

        {data.schedules.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No schedules configured yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-[0.1em] text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Frequency</th>
                  <th className="px-2 py-2 font-medium">Recipients</th>
                  <th className="px-2 py-2 font-medium">Webhook</th>
                  <th className="px-2 py-2 font-medium">Enabled</th>
                  <th className="px-2 py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.schedules.map((schedule) => (
                  <tr key={schedule.id} className="border-b border-border/40 last:border-0">
                    <td className="px-2 py-2 text-muted-foreground">{schedule.frequency}</td>
                    <td className="px-2 py-2 text-muted-foreground">{schedule.recipients || "n/a"}</td>
                    <td className="px-2 py-2 text-muted-foreground">{schedule.webhook_target || "n/a"}</td>
                    <td className="px-2 py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => void toggleSchedule(schedule)}
                      >
                        {schedule.enabled ? "enabled" : "disabled"}
                      </Button>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{formatDate(schedule.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

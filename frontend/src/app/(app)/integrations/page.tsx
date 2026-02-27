"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type IntegrationConfig = {
  llm_provider: "mock" | "openai";
  llm_api_url: string;
  alert_webhook_url: string;
  issue_tracker_url: string;
  updated_at: string;
};

type TestResult = {
  target: string;
  ok: boolean;
  http_status?: number | null;
  message: string;
};

const INITIAL_CONFIG: IntegrationConfig = {
  llm_provider: "mock",
  llm_api_url: "",
  alert_webhook_url: "",
  issue_tracker_url: "",
  updated_at: ""
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

export default function IntegrationsPage() {
  const [config, setConfig] = useState<IntegrationConfig>(INITIAL_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testLoadingTarget, setTestLoadingTarget] = useState<string>("");

  async function loadConfig() {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/integrations", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { detail?: string } & Partial<IntegrationConfig>;
      if (!response.ok) {
        throw new Error(body.detail || "Failed to load integration settings.");
      }
      setConfig({
        llm_provider: body.llm_provider === "openai" ? "openai" : "mock",
        llm_api_url: body.llm_api_url || "",
        alert_webhook_url: body.alert_webhook_url || "",
        issue_tracker_url: body.issue_tracker_url || "",
        updated_at: body.updated_at || ""
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load integration settings.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadConfig();
  }, []);

  async function handleSave() {
    setIsSaving(true);
    setErrorMessage("");
    setActionMessage("");
    try {
      const response = await fetch("/api/integrations", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config)
      });
      const body = (await response.json().catch(() => ({}))) as { detail?: string };
      if (!response.ok) {
        throw new Error(body.detail || "Failed to save integration settings.");
      }
      setActionMessage("Integration settings saved.");
      await loadConfig();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save integration settings.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTest(target: "llm" | "webhook" | "issue_tracker") {
    setTestLoadingTarget(target);
    setErrorMessage("");
    setActionMessage("");
    setTestResult(null);
    try {
      const response = await fetch("/api/integrations/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target })
      });
      const body = (await response.json().catch(() => ({}))) as {
        detail?: string;
        target?: string;
        ok?: boolean;
        http_status?: number | null;
        message?: string;
      };
      if (!response.ok && !body.message) {
        throw new Error(body.detail || "Connection test failed.");
      }
      setTestResult({
        target: body.target || target,
        ok: Boolean(body.ok),
        http_status: body.http_status ?? null,
        message: body.message || "Connection test finished."
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Connection test failed.");
    } finally {
      setTestLoadingTarget("");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-foreground">Integrations</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Configure provider endpoints and run safe connectivity checks.
        </p>
      </Card>

      {isLoading ? (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Loading integrations...</p>
        </Card>
      ) : null}

      {errorMessage ? (
        <Card className="border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{errorMessage}</p>
        </Card>
      ) : null}

      {actionMessage ? (
        <Card className="p-4">
          <p className="text-sm text-foreground">{actionMessage}</p>
        </Card>
      ) : null}

      {testResult ? (
        <Card className={testResult.ok ? "border-border p-4" : "border-destructive bg-destructive/10 p-4"}>
          <p className="text-sm text-foreground">
            {testResult.target}: {testResult.message}
            {typeof testResult.http_status === "number" ? ` (HTTP ${testResult.http_status})` : ""}
          </p>
        </Card>
      ) : null}

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground">Provider Configuration</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs uppercase tracking-[0.1em] text-muted-foreground">
            LLM provider
            <select
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
              value={config.llm_provider}
              onChange={(event) => setConfig((current) => ({ ...current, llm_provider: event.target.value as "mock" | "openai" }))}
            >
              <option value="mock">mock</option>
              <option value="openai">openai</option>
            </select>
          </label>

          <label className="space-y-1 text-xs uppercase tracking-[0.1em] text-muted-foreground">
            LLM API URL
            <Input
              className="h-11 text-sm"
              value={config.llm_api_url}
              onChange={(event) => setConfig((current) => ({ ...current, llm_api_url: event.target.value }))}
              placeholder="https://api.openai.com/v1/chat/completions"
            />
          </label>

          <label className="space-y-1 text-xs uppercase tracking-[0.1em] text-muted-foreground">
            Alert Webhook URL
            <Input
              className="h-11 text-sm"
              value={config.alert_webhook_url}
              onChange={(event) => setConfig((current) => ({ ...current, alert_webhook_url: event.target.value }))}
              placeholder="https://hooks.example.com/loglens"
            />
          </label>

          <label className="space-y-1 text-xs uppercase tracking-[0.1em] text-muted-foreground">
            Issue Tracker URL
            <Input
              className="h-11 text-sm"
              value={config.issue_tracker_url}
              onChange={(event) => setConfig((current) => ({ ...current, issue_tracker_url: event.target.value }))}
              placeholder="https://jira.example.com"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => void handleSave()} disabled={isSaving} className="h-10 text-sm">
            {isSaving ? "Saving..." : "Save settings"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 text-sm"
            onClick={() => void handleTest("llm")}
            disabled={testLoadingTarget === "llm"}
          >
            {testLoadingTarget === "llm" ? "Testing..." : "Test LLM"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 text-sm"
            onClick={() => void handleTest("webhook")}
            disabled={testLoadingTarget === "webhook"}
          >
            {testLoadingTarget === "webhook" ? "Testing..." : "Test webhook"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 text-sm"
            onClick={() => void handleTest("issue_tracker")}
            disabled={testLoadingTarget === "issue_tracker"}
          >
            {testLoadingTarget === "issue_tracker" ? "Testing..." : "Test issue tracker"}
          </Button>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">Last updated: {formatDate(config.updated_at)}</p>
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type WorkspacePrefs = {
  retention_days: number;
  default_level_filter: string;
  timezone: string;
};

type SessionRecord = {
  id: string;
  created_at: string;
  expires_at: string;
  is_active: boolean;
};

const DEFAULT_PREFS: WorkspacePrefs = {
  retention_days: 30,
  default_level_filter: "error",
  timezone: "UTC"
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }
  return date.toLocaleString();
}

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<WorkspacePrefs>(DEFAULT_PREFS);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  async function loadData() {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const [prefsResponse, sessionsResponse] = await Promise.all([
        fetch("/api/settings/workspace", { cache: "no-store" }),
        fetch("/api/auth/sessions", { cache: "no-store" })
      ]);

      const prefsBody = (await prefsResponse.json().catch(() => ({}))) as { detail?: string } & Partial<WorkspacePrefs>;
      const sessionsBody = (await sessionsResponse.json().catch(() => ({}))) as {
        detail?: string;
        sessions?: SessionRecord[];
      };

      if (!prefsResponse.ok) {
        throw new Error(prefsBody.detail || "Failed to load workspace preferences.");
      }
      if (!sessionsResponse.ok) {
        throw new Error(sessionsBody.detail || "Failed to load active sessions.");
      }

      setPrefs({
        retention_days:
          typeof prefsBody.retention_days === "number" && Number.isFinite(prefsBody.retention_days)
            ? prefsBody.retention_days
            : 30,
        default_level_filter: prefsBody.default_level_filter || "error",
        timezone: prefsBody.timezone || "UTC"
      });
      setSessions(Array.isArray(sessionsBody.sessions) ? sessionsBody.sessions : []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load settings.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function saveWorkspacePreferences() {
    setErrorMessage("");
    setActionMessage("");
    const response = await fetch("/api/settings/workspace", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(prefs)
    });
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    if (!response.ok) {
      setErrorMessage(body.detail || "Failed to save workspace preferences.");
      return;
    }
    setActionMessage("Workspace preferences updated.");
    await loadData();
  }

  async function changePassword() {
    setErrorMessage("");
    setActionMessage("");
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        old_password: oldPassword,
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm
      })
    });
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    if (!response.ok) {
      setErrorMessage(body.detail || "Failed to change password.");
      return;
    }
    setOldPassword("");
    setNewPassword("");
    setNewPasswordConfirm("");
    setActionMessage("Password changed successfully.");
  }

  async function revokeAllSessions() {
    setErrorMessage("");
    setActionMessage("");
    const response = await fetch("/api/auth/sessions/revoke-all", { method: "POST" });
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    if (!response.ok) {
      setErrorMessage(body.detail || "Failed to revoke sessions.");
      return;
    }
    setActionMessage("All sessions revoked.");
    await loadData();
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Manage workspace-level preferences and account security.</p>
      </Card>

      {isLoading ? (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Loading settings...</p>
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

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground">Workspace Preferences</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-xs uppercase tracking-[0.1em] text-muted-foreground">
            Retention days
            <Input
              className="h-11 text-sm"
              type="number"
              min={1}
              max={3650}
              value={String(prefs.retention_days)}
              onChange={(event) =>
                setPrefs((current) => ({
                  ...current,
                  retention_days: Math.max(1, Number.parseInt(event.target.value || "1", 10) || 1)
                }))
              }
            />
          </label>

          <label className="space-y-1 text-xs uppercase tracking-[0.1em] text-muted-foreground">
            Default filter
            <select
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
              value={prefs.default_level_filter}
              onChange={(event) => setPrefs((current) => ({ ...current, default_level_filter: event.target.value }))}
            >
              <option value="debug">debug</option>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
              <option value="fatal">fatal</option>
            </select>
          </label>

          <label className="space-y-1 text-xs uppercase tracking-[0.1em] text-muted-foreground">
            Timezone
            <Input
              className="h-11 text-sm"
              value={prefs.timezone}
              onChange={(event) => setPrefs((current) => ({ ...current, timezone: event.target.value }))}
              placeholder="Asia/Manila"
            />
          </label>
        </div>
        <Button type="button" className="mt-4 h-10 text-sm" onClick={() => void saveWorkspacePreferences()}>
          Save workspace settings
        </Button>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground">Account Security</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Input
            className="h-11 text-sm"
            type="password"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
            placeholder="Current password"
          />
          <Input
            className="h-11 text-sm"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="New password"
          />
          <Input
            className="h-11 text-sm"
            type="password"
            value={newPasswordConfirm}
            onChange={(event) => setNewPasswordConfirm(event.target.value)}
            placeholder="Confirm new password"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" className="h-10 text-sm" onClick={() => void changePassword()}>
            Change password
          </Button>
          <Button type="button" variant="outline" className="h-10 text-sm" onClick={() => void revokeAllSessions()}>
            Sign out all sessions
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-[0.1em] text-muted-foreground">
                <th className="px-2 py-2 font-medium">Session</th>
                <th className="px-2 py-2 font-medium">Created</th>
                <th className="px-2 py-2 font-medium">Expires</th>
                <th className="px-2 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td className="px-2 py-2 text-muted-foreground" colSpan={4}>
                    No active sessions.
                  </td>
                </tr>
              ) : (
                sessions.map((session) => (
                  <tr key={session.id} className="border-b border-border/40 last:border-0">
                    <td className="px-2 py-2 text-foreground">{session.id.slice(0, 8)}...</td>
                    <td className="px-2 py-2 text-muted-foreground">{formatDate(session.created_at)}</td>
                    <td className="px-2 py-2 text-muted-foreground">{formatDate(session.expires_at)}</td>
                    <td className="px-2 py-2 text-muted-foreground">{session.is_active ? "active" : "revoked/expired"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

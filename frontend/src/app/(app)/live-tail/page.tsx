"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type LiveTailEvent = {
  id: number;
  analysis_id: number;
  source_id: number;
  source_name: string;
  line_no: number;
  timestamp: string | null;
  level: string;
  service: string;
  message: string;
  created_at: string;
};

type StreamPayload = {
  events: LiveTailEvent[];
  cursor: number | null;
  snapshot: boolean;
};

const LEVEL_OPTIONS = ["all", "debug", "info", "warn", "error", "fatal", "unknown"] as const;
const MAX_BUFFERED_EVENTS = 600;
const MAX_RECONNECT_BACKOFF_MS = 15_000;

function formatTimestamp(value: string | null) {
  if (!value) {
    return "n/a";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }
  return date.toLocaleString();
}

export default function LiveTailPage() {
  const [isPaused, setIsPaused] = useState(false);
  const [levelFilter, setLevelFilter] = useState<(typeof LEVEL_OPTIONS)[number]>("all");
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [events, setEvents] = useState<LiveTailEvent[]>([]);
  const [truncatedEvents, setTruncatedEvents] = useState(0);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [lastUpdateAt, setLastUpdateAt] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [reconnectToken, setReconnectToken] = useState(0);
  const [nextReconnectAt, setNextReconnectAt] = useState<string | null>(null);

  useEffect(() => {
    if (isPaused) {
      setIsConnecting(false);
      setNextReconnectAt(null);
      return undefined;
    }

    setIsConnecting(true);
    if (reconnectAttempt === 0) {
      setConnectionError("");
    }

    const params = new URLSearchParams();
    if (levelFilter !== "all") {
      params.set("level", levelFilter);
    }
    if (activeSearch.trim()) {
      params.set("q", activeSearch.trim());
    }
    const url = `/api/live-tail/stream${params.toString() ? `?${params.toString()}` : ""}`;

    const source = new EventSource(url, { withCredentials: true });
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    source.onopen = () => {
      setIsConnecting(false);
      setConnectionError("");
      setReconnectAttempt(0);
      setNextReconnectAt(null);
    };
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as StreamPayload;
        if (!Array.isArray(payload.events)) {
          return;
        }
        setEvents((current) => {
          let merged = payload.snapshot ? payload.events : [...current, ...payload.events];
          if (merged.length > MAX_BUFFERED_EVENTS) {
            const dropped = merged.length - MAX_BUFFERED_EVENTS;
            setTruncatedEvents((total) => total + dropped);
            merged = merged.slice(-MAX_BUFFERED_EVENTS);
          }
          return merged;
        });
        setConnectionError("");
        setLastUpdateAt(new Date().toISOString());
      } catch {
        setConnectionError("Failed to decode streaming payload.");
      }
    };

    source.onerror = () => {
      setIsConnecting(false);
      const nextAttempt = reconnectAttempt + 1;
      const delayMs = Math.min(2 ** (nextAttempt - 1) * 1000, MAX_RECONNECT_BACKOFF_MS);
      setReconnectAttempt(nextAttempt);
      setConnectionError(`Live stream connection dropped. Reconnecting in ${Math.ceil(delayMs / 1000)}s.`);
      setNextReconnectAt(new Date(Date.now() + delayMs).toISOString());
      source.close();
      reconnectTimer = setTimeout(() => {
        setReconnectToken((token) => token + 1);
      }, delayMs);
    };

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      source.close();
    };
  }, [isPaused, levelFilter, activeSearch, reconnectToken]);

  const sortedEvents = useMemo(() => {
    return [...events].sort((left, right) => left.id - right.id);
  }, [events]);

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-foreground">Live Tail</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Real-time stream of redacted log events with interactive level and text filters.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-[200px_minmax(0,1fr)_auto_auto] md:items-end">
          <label className="space-y-1 text-xs uppercase tracking-[0.1em] text-muted-foreground">
            Level
            <select
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
              value={levelFilter}
              onChange={(event) => setLevelFilter(event.target.value as (typeof LEVEL_OPTIONS)[number])}
              aria-label="Filter live-tail stream by level"
            >
              {LEVEL_OPTIONS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs uppercase tracking-[0.1em] text-muted-foreground">
            Search
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search message text..."
              maxLength={200}
              className="h-11 text-sm"
              aria-label="Search live-tail messages"
            />
          </label>

          <Button
            type="button"
            variant="outline"
            className="h-11 text-sm"
            onClick={() => {
              setEvents([]);
              setTruncatedEvents(0);
              setReconnectAttempt(0);
              setReconnectToken((token) => token + 1);
              setActiveSearch(searchInput.trim());
            }}
            aria-label="Apply live-tail filters"
          >
            Apply filters
          </Button>

          <Button
            type="button"
            variant={isPaused ? "default" : "secondary"}
            className="h-11 text-sm"
            onClick={() => {
              setIsPaused((current) => !current);
              setReconnectAttempt(0);
              setReconnectToken((token) => token + 1);
            }}
            aria-label={isPaused ? "Resume live-tail stream" : "Pause live-tail stream"}
          >
            {isPaused ? "Resume" : "Pause"}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>Status: {isPaused ? "paused" : isConnecting ? "connecting" : "streaming"}</span>
          <span>Events buffered: {sortedEvents.length}</span>
          <span>Buffer cap: {MAX_BUFFERED_EVENTS}</span>
          {truncatedEvents > 0 ? <span>Truncated: {truncatedEvents} older events dropped</span> : null}
          <span>Last update: {formatTimestamp(lastUpdateAt)}</span>
          {nextReconnectAt ? <span>Reconnect at: {formatTimestamp(nextReconnectAt)}</span> : null}
        </div>
      </Card>

      {connectionError ? (
        <Card className="border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{connectionError}</p>
        </Card>
      ) : null}

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground">Stream events</h2>
        {sortedEvents.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            {isPaused ? "Stream paused. Resume to receive events." : "No events received yet for current filters."}
          </p>
        ) : (
          <div className="mt-3 max-h-[55vh] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-[0.1em] text-muted-foreground">
                  <th className="px-2 py-2 font-medium">ID</th>
                  <th className="px-2 py-2 font-medium">Timestamp</th>
                  <th className="px-2 py-2 font-medium">Level</th>
                  <th className="px-2 py-2 font-medium">Source</th>
                  <th className="px-2 py-2 font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {sortedEvents.map((event) => (
                  <tr key={event.id} className="border-b border-border/40 align-top last:border-0">
                    <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{event.id}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{formatTimestamp(event.timestamp)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{event.level}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{event.source_name}</td>
                    <td className="px-2 py-2 font-mono text-xs text-foreground">{event.message}</td>
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

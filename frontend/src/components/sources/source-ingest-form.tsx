"use client";

import { FormEvent, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";

const MAX_PASTE_BYTES = 2 * 1024 * 1024;

type Mode = "upload" | "paste";

type SourceResponse = {
  id: number;
  name: string;
  type: string;
  created_at: string;
};

export function SourceIngestForm() {
  const [mode, setMode] = useState<Mode>("upload");
  const [sourceName, setSourceName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedLogs, setPastedLogs] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [success, setSuccess] = useState<SourceResponse | null>(null);

  const pasteByteLength = useMemo(() => new TextEncoder().encode(pastedLogs).length, [pastedLogs]);

  const submitDisabled =
    isSubmitting || (mode === "upload" ? !selectedFile : !pastedLogs.trim() || pasteByteLength > MAX_PASTE_BYTES);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccess(null);

    let fileToSend: File | null = null;
    if (mode === "upload") {
      if (!selectedFile) {
        setErrorMessage("Select a file before uploading.");
        return;
      }
      fileToSend = selectedFile;
    } else {
      if (!pastedLogs.trim()) {
        setErrorMessage("Paste logs before submitting.");
        return;
      }
      if (pasteByteLength > MAX_PASTE_BYTES) {
        setErrorMessage(`Pasted logs exceed ${MAX_PASTE_BYTES} bytes.`);
        return;
      }

      fileToSend = new File([pastedLogs], "pasted.log", { type: "text/plain" });
    }

    const payload = new FormData();
    payload.append("file", fileToSend);
    if (sourceName.trim()) {
      payload.append("name", sourceName.trim());
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/sources", {
        method: "POST",
        body: payload
      });
      const body = await response.json();
      if (!response.ok) {
        setErrorMessage(body.detail || "Source upload failed.");
        return;
      }

      setSuccess(body);
      if (mode === "upload") {
        setSelectedFile(null);
      } else {
        setPastedLogs("");
      }
      setSourceName("");
    } catch {
      setErrorMessage("Request failed. Check frontend/backend connectivity.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-lg border px-3 py-2 text-sm ${
              mode === "upload"
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border bg-muted text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("upload")}
          >
            File upload
          </button>
          <button
            type="button"
            className={`rounded-lg border px-3 py-2 text-sm ${
              mode === "paste"
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border bg-muted text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("paste")}
          >
            Paste logs
          </button>
        </div>

        <label className="block text-sm text-muted-foreground">
          Source name (optional)
          <input
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none ring-0 focus:border-primary"
            type="text"
            value={sourceName}
            onChange={(event) => setSourceName(event.target.value)}
            placeholder={mode === "upload" ? "production-app.log" : "Pasted error sample"}
          />
        </label>

        {mode === "upload" ? (
          <div className="space-y-2">
            <label className="block text-sm text-muted-foreground">
              Select log file
              <input
                className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm file:text-foreground"
                type="file"
                accept=".log,.txt,.jsonl,.gz"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              />
            </label>
            {!selectedFile && (
              <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Empty state: no file selected yet.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-sm text-muted-foreground">
              Pasted logs
              <textarea
                className="mt-1 min-h-48 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground outline-none ring-0 focus:border-primary"
                value={pastedLogs}
                onChange={(event) => setPastedLogs(event.target.value)}
                placeholder="Paste raw logs here..."
              />
            </label>
            {!pastedLogs.trim() && (
              <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Empty state: paste logs to enable submit.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Payload size: {pasteByteLength} / {MAX_PASTE_BYTES} bytes
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={submitDisabled}
          className="rounded-lg border border-primary bg-primary/20 px-4 py-2 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
        >
          {isSubmitting ? "Submitting..." : mode === "upload" ? "Upload source" : "Create source from paste"}
        </button>
      </Card>

      {errorMessage && (
        <Card className="border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">Error: {errorMessage}</p>
        </Card>
      )}

      {success && (
        <Card className="border-success bg-success/10 p-4">
          <h3 className="text-sm font-semibold text-foreground">Source created</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            ID {success.id} · {success.name} · {success.type}
          </p>
        </Card>
      )}
    </form>
  );
}

import { AppShell } from "@/components/layout/app-shell";
import { SourceIngestForm } from "@/components/sources/source-ingest-form";
import { Card } from "@/components/ui/card";

export default function NewSourcePage() {
  return (
    <AppShell>
      <Card className="p-4">
        <h2 className="text-base font-semibold">Create Source</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload a log file or paste logs. Pasted logs are sent as a generated `.log` payload through the same
          validated source endpoint.
        </p>
      </Card>
      <SourceIngestForm />
    </AppShell>
  );
}

import { LatestUploadedSourcesTable } from "@/components/sources/latest-uploaded-sources-table";
import { SourceIngestForm } from "@/components/sources/source-ingest-form";
import { Card } from "@/components/ui/card";

export default function UploadLogsPage() {
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-foreground">Upload Logs</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ingest sources via file upload or pasted log text. Validation states enforce format and payload limits before
          source creation.
        </p>
      </Card>
      <SourceIngestForm />
      <LatestUploadedSourcesTable />
    </div>
  );
}

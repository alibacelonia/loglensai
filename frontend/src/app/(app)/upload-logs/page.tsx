import { Card } from "@/components/ui/card";

export default function UploadLogsPage() {
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold text-foreground">Upload Logs</h1>
      <p className="mt-2 text-sm text-muted-foreground">Upload files, validate source format, and queue analysis jobs.</p>
    </Card>
  );
}

import { Card } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
      <p className="mt-2 text-sm text-muted-foreground">Monitor log pipeline health, ingestion throughput, and active alerts.</p>
    </Card>
  );
}

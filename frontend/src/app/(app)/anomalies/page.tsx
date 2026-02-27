import { Card } from "@/components/ui/card";

export default function AnomaliesPage() {
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold text-foreground">Anomalies</h1>
      <p className="mt-2 text-sm text-muted-foreground">Review outliers, suspicious patterns, and confidence-scored anomaly groups.</p>
    </Card>
  );
}

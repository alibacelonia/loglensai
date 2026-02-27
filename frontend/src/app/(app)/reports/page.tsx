import { Card } from "@/components/ui/card";

export default function ReportsPage() {
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold text-foreground">Reports</h1>
      <p className="mt-2 text-sm text-muted-foreground">Generate and export analysis summaries for postmortems and stakeholders.</p>
    </Card>
  );
}

import { Card } from "@/components/ui/card";

export default function LiveTailPage() {
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold text-foreground">Live Tail</h1>
      <p className="mt-2 text-sm text-muted-foreground">Stream log events in real time and highlight bursts or critical failures.</p>
    </Card>
  );
}

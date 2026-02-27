import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default function HomePage() {
  return (
    <AppShell>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold">Analysis Feed</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Next iterations will wire API-backed source uploads and analysis results.
          </p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold">Status</h3>
          <p className="mt-2 text-sm text-muted-foreground">UI shell initialized with sidebar and topbar.</p>
        </Card>
      </div>
    </AppShell>
  );
}

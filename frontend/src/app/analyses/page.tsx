import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default function AnalysesIndexPage() {
  return (
    <AppShell>
      <Card className="p-4">
        <h2 className="text-base font-semibold">Analyses</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Open a specific analysis result page by ID, for example{" "}
          <Link href="/analyses/1" className="text-primary underline underline-offset-4">
            /analyses/1
          </Link>
          .
        </p>
      </Card>
    </AppShell>
  );
}

import { AnalysisResultsTabs } from "@/components/analyses/analysis-results-tabs";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default async function AnalysisResultsPage({
  params
}: {
  params: Promise<{ analysisId: string }>;
}) {
  const { analysisId } = await params;

  return (
    <AppShell>
      <Card className="p-4">
        <h2 className="text-base font-semibold">Analysis Results</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Analysis ID: {analysisId}. This page provides tabbed navigation for summary, clusters, and timeline.
        </p>
      </Card>
      <AnalysisResultsTabs analysisId={analysisId} />
    </AppShell>
  );
}

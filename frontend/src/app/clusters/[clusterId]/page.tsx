import { ClusterDetailView } from "@/components/analyses/cluster-detail-view";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default async function ClusterDetailPage({
  params
}: {
  params: Promise<{ clusterId: string }>;
}) {
  const { clusterId } = await params;

  return (
    <AppShell>
      <Card className="p-4">
        <h2 className="text-base font-semibold">Cluster Detail</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Cluster ID: {clusterId}. Inspect fingerprint context and sample evidence for this incident group.
        </p>
      </Card>
      <ClusterDetailView clusterId={clusterId} />
    </AppShell>
  );
}

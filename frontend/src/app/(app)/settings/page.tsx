import { Card } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      <p className="mt-2 text-sm text-muted-foreground">Manage workspace preferences, retention, and security controls.</p>
    </Card>
  );
}

export function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/80 bg-background px-4 py-3 text-xs text-muted-foreground md:px-6 lg:px-8">
      © {year} AI Log Analyzer. All rights reserved.
    </footer>
  );
}

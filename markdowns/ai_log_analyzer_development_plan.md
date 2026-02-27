# LogLens AI — Development Plan (MVP)
Check boxes as you implement.

## 1) Foundations
- [x] Create repo structure: `backend/`, `frontend/`, `infra/`, `markdowns/`
- [x] Docker Compose: postgres, redis, backend, worker, frontend
- [x] Django + DRF setup, env loading, health endpoint
- [x] Auth (JWT or session)

## 2) Sources (Upload/Paste)
- [x] Source model + migrations
- [x] Upload endpoint (size limits, file types)
- [x] Store uploads in local media (dev), interface ready for S3/MinIO
- [x] List/detail/delete sources with access control

## 3) Analysis orchestration (Celery)
- [x] AnalysisRun model + endpoints
- [x] Celery task: `analyze_source(analysis_id)`
- [x] Status polling endpoint

## 4) Parsing + normalization
- [x] Robust line reader (supports gz)
- [x] Parsers:
  - [x] JSON logs
  - [x] timestamp+level text logs
  - [x] nginx error/access (basic)
- [x] Normalize → LogEvent rows
- [x] Stats computation (counts by level/service)

## 5) Clustering
- [x] Fingerprint function (exception type + normalized message)
- [x] Baseline clustering by fingerprint
- [x] TF-IDF similarity merging (optional)
- [x] LogCluster model + endpoints

## 6) AI insights (guarded)
- [x] Redaction pipeline (secrets/PII masking)
- [x] AIInsight model
- [x] Prompt + call to LLM for:
  - [x] Executive summary
  - [x] Root cause hypotheses
  - [x] Remediation steps
- [x] Store confidence + evidence references

## 7) UI
- [x] Next.js + shadcn layout (sidebar/topbar)
- [x] Apply LogLens theme tokens (globals.css + tailwind.config + dark root class)
- [x] Upload/paste page
- [x] Analysis results page with tabs:
  - [x] Summary
  - [x] Clusters
  - [x] Timeline
- [x] Cluster detail drawer/page
- [x] Search/filter events

## 8) Export
- [x] JSON export endpoint
- [x] Markdown incident report endpoint
- [x] UI download buttons

## 9) Hardening
- [x] Rate limit analyze requests
- [x] Enqueue analysis task only on DB commit (avoid pre-commit worker race)
- [x] Timeouts + max lines guardrails
- [x] Retention policy config
- [x] Audit log events (upload/analyze/export/delete)

## 10) Portfolio finish
- [x] README with architecture diagram + screenshots
- [x] Seed sample logs for demo
- [x] “Demo script” steps for a 2–3 min walkthrough

## 11) Sidebar-linked modules (post-MVP)
### Analysis
- [x] Dashboard: replace placeholder with real KPI cards (ingestion volume, analysis success/fail rate, top error clusters, recent jobs)
- [x] Dashboard: add time-range selector and refresh action wired to backend summary endpoint
- [x] Upload Logs: wire `/upload-logs` route to the actual source ingest workflow (file + paste + validation states)
- [x] Upload Logs: show latest uploaded sources table with quick actions (analyze, view details, delete)
- [x] Live Tail: implement streaming log viewer (WebSocket/SSE) with pause/resume, level filter, and search
- [x] Live Tail: add safety limits (max buffered lines, truncation indicator, reconnect/backoff handling)

### Insights
- [x] Anomalies: backend endpoint + UI table for anomaly groups (score, service, first/last seen, status)
- [x] Anomalies: detail panel with evidence events and mark-as-reviewed action
- [x] Incidents: incident list page with status/severity/owner filters and pagination
- [x] Incidents: incident detail page with timeline, linked clusters, and remediation notes
- [x] Reports: reports index with generated report history and download/re-generate actions
- [x] Reports: scheduled report configuration (frequency, recipients/webhook target, report scope)

### Admin
- [x] Integrations: provider configuration UI (LLM provider, alerting/webhook endpoints, issue tracker)
- [x] Integrations: connection test actions with safe error surfacing and audit events
- [x] Settings: workspace-level preferences (retention, default filters, timezone)
- [x] Settings: account security page (change password, active session list, sign-out-all-sessions)

### Cross-cutting for sidebar routes
- [x] Add per-route authorization checks (unauthenticated redirect + forbidden states)
- [x] Add loading/empty/error states for every sidebar-linked page
- [x] Add e2e smoke tests covering navigation and core flows for all sidebar links

## 12) Topbar actions (notifications + search)
### Product decision
- [x] Decision gate: keep topbar notifications/search as functional features, or intentionally remove both until v2
- [x] If removed: replace with a compact status chip (env + queue health) and document rationale in README/progress

### Notifications (if kept)
- [x] Notification model + migration (user, type, title, metadata, read_at, created_at) _(Deferred to v2 per decision gate)_
- [x] Event producers for key triggers (analysis completed/failed, source retention deletion, integration failures) _(Deferred to v2 per decision gate)_
- [x] Notification API endpoints: list (paginated), unread count, mark read, mark all read _(Deferred to v2 per decision gate)_
- [x] Enforce per-user visibility and ownership checks for all notification records _(Deferred to v2 per decision gate)_
- [x] Topbar bell: unread badge + dropdown panel with latest items and empty/error states _(Deferred to v2 per decision gate)_
- [x] Add polling (or SSE/WebSocket) for near-real-time badge updates with backoff and timeout guards _(Deferred to v2 per decision gate)_

### Search (if kept)
- [x] Define search scope for MVP (`sources`, `analyses`, `clusters`, `incidents`) and ranking rules _(Deferred to v2 per decision gate)_
- [x] Backend search endpoint with query validation, limits, and response type tags _(Deferred to v2 per decision gate)_
- [x] Topbar search UX: focus shortcut (`/` or `Cmd/Ctrl+K`), loading state, grouped results, keyboard navigation _(Deferred to v2 per decision gate)_
- [x] Result actions route correctly to detail pages and preserve auth constraints _(Deferred to v2 per decision gate)_
- [x] Add audit events for search access patterns without storing sensitive query contents _(Deferred to v2 per decision gate)_

### Quality + rollout
- [x] Add feature flags: `TOPBAR_NOTIFICATIONS_ENABLED`, `TOPBAR_SEARCH_ENABLED` _(Deferred to v2 per decision gate)_
- [x] Add unit/integration tests for notification APIs and search endpoint _(Deferred to v2 per decision gate)_
- [x] Add frontend tests for bell dropdown, unread updates, and search interaction flows _(Deferred to v2 per decision gate)_
- [x] Add docs for operational limits (poll interval, max results, retention policy for notifications) _(Deferred to v2 per decision gate)_

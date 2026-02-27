# LogLens AI — AI Log Analyzer (MVP)
**Purpose:** Upload logs (or stream them) → detect anomalies → cluster errors → suggest root cause + fixes → generate incident summaries.  
**Target users:** DevOps, SRE, backend engineers, small teams running Docker/K8s, agencies managing client infra.

---

## 1) What this project demonstrates (portfolio signals)
- Practical LLM use: summarization, clustering, RCA hypotheses, remediation guidance
- Systems thinking: ingestion, parsing, indexing, alerting, multi-tenant separation
- Observability basics: severity, timelines, correlation IDs, traces/log levels
- Engineering rigor: PII/secret redaction, deterministic pipelines, auditability

---

## 2) MVP scope (ship-fast but impressive)
### MVP user flow
1. User signs in  
2. Creates a **Source**:
   - **Upload**: `.log`, `.txt`, `.jsonl`, `.gz`
   - (Optional) Paste logs
3. Click **Analyze**
4. Results:
   - Executive summary (what’s happening)
   - Top error clusters
   - Timeline view (spikes)
   - Suspected root causes + confidence
   - Suggested fixes (actionable steps)
   - Export incident report (Markdown/JSON)

### In-scope log types
- Plain text app logs (Python/Node/Java)
- Nginx access/error logs
- Docker container logs
- Kubernetes pod logs (copied output)
- JSON structured logs (preferred)

### Out of scope (for MVP)
- Real-time agents on servers (later)
- Full APM tracing (later)

---

## 3) Core features
### 3.1 Parsing & normalization
- Detect common patterns:
  - timestamp
  - severity (INFO/WARN/ERROR)
  - service/component
  - request_id / trace_id / correlation_id
  - exception type + message
- Normalize each line into a **LogEvent** record.

**Normalization output fields**
- `timestamp` (datetime, optional if missing)
- `level` (debug/info/warn/error/fatal/unknown)
- `service` (string, optional)
- `message` (string)
- `raw` (string)
- `fingerprint` (hash)
- `request_id` / `trace_id` (optional)
- `tags` (json)
- `source_line_no`

### 3.2 Clustering & grouping (non-LLM baseline)
- Cluster similar events using:
  - fingerprinting (exception type + normalized message)
  - TF-IDF cosine similarity (baseline, optional)
- Output:
  - Cluster title
  - Example lines
  - Frequency
  - First seen / last seen
  - Affected services

### 3.3 AI analysis
**AI tasks (MVP)**
1. **Incident summary**
   - What happened
   - Impact estimate (based on error frequency / keywords)
   - When it started + peak window
2. **Root cause hypotheses**
   - 2–5 likely causes, ranked
   - Confidence score (0–1)
   - Evidence links: cluster IDs + sample logs
3. **Remediation playbook**
   - Immediate mitigation
   - Permanent fix suggestions
   - Validation steps
4. **Runbook generator** (optional)
   - “If this happens again, do X”

**Guardrails**
- Secrets/PII redaction before sending to LLM
- Never include full tokens/keys/credentials in outputs
- “AI suggestions are hypotheses” disclaimer

### 3.4 Exports
- `export.json` (events + clusters + AI outputs)
- `export.md` incident report (shareable)

---

## 4) Enterprise-ready considerations (baked into MVP)
### Security
- Per-tenant/user isolation (tenant_id on all data)
- Redaction pipeline:
  - API keys, JWTs, emails, phone numbers, IPs (configurable)
- Encrypt at rest (managed DB/storage in prod)
- Audit log:
  - upload, analyze, export, delete

### Reliability
- Background jobs for analysis (Celery worker)
- Timeouts + size limits
- Idempotent jobs (safe re-run)

### Governance
- Retention policy:
  - auto-delete raw uploads after N days
- Role-based access (later): Admin/Member/Viewer

---

## 5) Architecture
### Services (MVP)
- **frontend**: Next.js + shadcn UI
- **backend**: Django + DRF (auth, sources, analyses, exports)
- **worker**: Celery (parsing + clustering + LLM calls)
- **redis**: Celery broker
- **postgres**: relational store
- **object storage**: local (dev) → S3/MinIO (prod-ready)

### Data plane
- uploads stored as objects; parsed events stored in DB
- analysis results stored in DB as structured JSON

---

## 6) Data model (minimal)
- **Source**
  - `id`, `owner`, `name`
  - `type` (upload/paste)
  - `file_object_key` (nullable)
  - `created_at`
- **AnalysisRun**
  - `id`, `source`
  - `status` (queued/running/completed/failed)
  - `started_at`, `finished_at`
  - `stats` (json: total_lines, error_count, services)
- **LogEvent**
  - `id`, `analysis_run`
  - `timestamp`, `level`, `service`, `message`, `raw`
  - `fingerprint`, `trace_id`, `request_id`
  - `line_no`, `tags` (json)
- **LogCluster**
  - `id`, `analysis_run`
  - `fingerprint`, `title`
  - `count`, `first_seen`, `last_seen`
  - `sample_events` (json: line_nos or event ids)
- **AIInsight**
  - `analysis_run`
  - `executive_summary` (text)
  - `root_causes` (json list: {title, confidence, evidence_cluster_ids})
  - `remediation` (markdown/text)
  - `runbook` (text, optional)

---

## 7) API (MVP)
### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/me`

### Sources
- `POST /api/sources` (upload or paste)
- `GET /api/sources`
- `GET /api/sources/:id`
- `DELETE /api/sources/:id`

### Analyses
- `POST /api/sources/:id/analyze` (create AnalysisRun)
- `GET /api/analyses/:id` (status + stats + AIInsight summary)
- `GET /api/analyses/:id/events` (paged, filter: level/service/time range)
- `GET /api/analyses/:id/clusters` (sorted by count)
- `GET /api/clusters/:id` (details + sample lines)

### Export
- `GET /api/analyses/:id/export.json`
- `GET /api/analyses/:id/export.md`

---

## 8) UI (Next.js + shadcn)
### Pages
- `/dashboard` — Sources + Recent Analyses
- `/sources/new` — Upload / Paste
- `/sources/[id]` — Preview + “Analyze”
- `/analyses/[id]` — Results
  - Tabs: Summary / Clusters / Timeline / Raw
- `/clusters/[id]` — cluster detail + evidence

### Key components
- Findings table (clusters)
- Timeline chart (error count per minute/hour)
- Code/log viewer with line numbers + search
- Badges for severity + service

---

## 9) Docker Compose (dev)
- postgres
- redis
- backend
- worker
- frontend

---

## 10) Stretch features (after MVP)
- Live tail / webhook ingestion
- K8s integration (read pod logs via API)
- Slack / email alerts (threshold-based)
- Saved detection rules (“alert when error_rate > X”)
- Multi-source correlation by trace_id
- RAG on your runbooks + past incidents
- SSO (SAML/OIDC), RBAC, orgs/teams

## 11) UI Theme:
- UI Theme: see markdowns/branding.md

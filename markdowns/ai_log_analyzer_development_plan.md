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
- [ ] Store confidence + evidence references

## 7) UI
- [ ] Next.js + shadcn layout (sidebar/topbar)
- [ ] Apply LogLens theme tokens (globals.css + tailwind.config + dark root class)
- [ ] Upload/paste page
- [ ] Analysis results page with tabs:
  - [ ] Summary
  - [ ] Clusters
  - [ ] Timeline
- [ ] Cluster detail drawer/page
- [ ] Search/filter events

## 8) Export
- [ ] JSON export endpoint
- [ ] Markdown incident report endpoint
- [ ] UI download buttons

## 9) Hardening
- [ ] Rate limit analyze requests
- [ ] Timeouts + max lines guardrails
- [ ] Retention policy config
- [ ] Audit log events (upload/analyze/export/delete)

## 10) Portfolio finish
- [ ] README with architecture diagram + screenshots
- [ ] Seed sample logs for demo
- [ ] “Demo script” steps for a 2–3 min walkthrough

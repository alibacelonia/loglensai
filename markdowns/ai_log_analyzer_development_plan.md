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
- [ ] Robust line reader (supports gz)
- [ ] Parsers:
  - [ ] JSON logs
  - [ ] timestamp+level text logs
  - [ ] nginx error/access (basic)
- [ ] Normalize → LogEvent rows
- [ ] Stats computation (counts by level/service)

## 5) Clustering
- [ ] Fingerprint function (exception type + normalized message)
- [ ] Baseline clustering by fingerprint
- [ ] TF-IDF similarity merging (optional)
- [ ] LogCluster model + endpoints

## 6) AI insights (guarded)
- [ ] Redaction pipeline (secrets/PII masking)
- [ ] AIInsight model
- [ ] Prompt + call to LLM for:
  - [ ] Executive summary
  - [ ] Root cause hypotheses
  - [ ] Remediation steps
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

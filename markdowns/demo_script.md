# LogLens AI Demo Script (2-3 Minutes)

## Goal
Show end-to-end incident analysis from upload to exports in under 3 minutes.

## Pre-Demo Setup (30s before recording)
1. Start services:
   ```bash
   docker compose up -d
   ```
2. Open frontend: `http://localhost:3100`
3. Keep terminal ready for API token retrieval if needed.

## Walkthrough Timeline

### 0:00-0:20 — Introduce System
1. On Dashboard, state the architecture quickly:
   - Next.js frontend
   - Django API
   - Celery worker
   - Postgres + Redis
2. Mention security/hardening highlights:
   - redaction pipeline
   - analyze request rate limits
   - audit logging

### 0:20-1:00 — Upload a Seeded Incident Log
1. Go to **Sources** (`/sources/new`).
2. Select upload mode.
3. Upload: `demo/sample_logs/webapp_checkout_incident.log`.
4. Confirm successful source creation in UI state.

### 1:00-1:40 — Run Analysis and Inspect Results
1. Navigate to an analysis page (or trigger analyze from API/UI flow used in your session).
2. Load analysis with access token.
3. Show tabs:
   - **Summary**: executive summary + confidence
   - **Clusters**: top recurring failure clusters
   - **Timeline**: spike visualization
4. Open one cluster detail page and show sample evidence rows.

### 1:40-2:20 — Search/Filter + Export
1. In **Search Events**, filter:
   - `q=timeout`
   - `level=error`
   - `service=api`
2. Show narrowed event table.
3. Click:
   - **Download JSON**
   - **Download Markdown**
4. Mention export payload/report are owner-scoped and redacted.

### 2:20-2:50 — Hardening and Close
1. Mention retention and audit trail:
   - retention cleanup command available (`run_retention_cleanup`)
   - upload/analyze/export/delete actions are audit logged
2. Final value statement:
   - “LogLens AI turns noisy logs into actionable incident summaries with safe defaults.”

## Backup Demo Files
- `demo/sample_logs/webapp_checkout_incident.log`
- `demo/sample_logs/nginx_5xx_spike.log`
- `demo/sample_logs/k8s_inventory_service.jsonl`

## Optional API Backup (if UI flow stalls)
```bash
# Register
curl -X POST http://localhost:8000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo_user","email":"demo_user@example.com","password":"Password123!","password_confirm":"Password123!"}'

# Upload
curl -X POST http://localhost:8000/api/sources \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -F "file=@demo/sample_logs/webapp_checkout_incident.log;type=text/plain"

# Analyze
curl -X POST http://localhost:8000/api/sources/<SOURCE_ID>/analyze \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

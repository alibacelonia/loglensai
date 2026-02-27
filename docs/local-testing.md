# Local Testing Guide

This guide validates the full local flow for LogLens AI using Docker Compose.

## 1) Start the stack
```bash
cd /Users/ralphvincent/personal-projects/loglensai
docker compose up -d --build
docker compose ps
```

## 2) Register a user and capture JWT access token (API validation path)
```bash
REG=$(curl -sS -X POST http://localhost:8000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"localdemo","email":"localdemo@example.com","password":"Password123!","password_confirm":"Password123!"}')

ACCESS=$(python - <<'PY' "$REG"
import json,sys
print(json.loads(sys.argv[1])["access"])
PY
)

echo "$ACCESS" | cut -c1-20
```

## 3) Upload a seeded sample log
```bash
SRC=$(curl -sS -X POST http://localhost:8000/api/sources \
  -H "Authorization: Bearer $ACCESS" \
  -F "file=@demo/sample_logs/webapp_checkout_incident.log;type=text/plain")

SOURCE_ID=$(python - <<'PY' "$SRC"
import json,sys
print(json.loads(sys.argv[1])["id"])
PY
)

echo "$SOURCE_ID"
```

## 4) Start analysis and poll status
```bash
AN=$(curl -sS -X POST "http://localhost:8000/api/sources/$SOURCE_ID/analyze" \
  -H "Authorization: Bearer $ACCESS")

ANALYSIS_ID=$(python - <<'PY' "$AN"
import json,sys
print(json.loads(sys.argv[1])["id"])
PY
)

for i in $(seq 1 60); do
  RES=$(curl -sS "http://localhost:8000/api/analyses/$ANALYSIS_ID" \
    -H "Authorization: Bearer $ACCESS")
  STATUS=$(python - <<'PY' "$RES"
import json,sys
print(json.loads(sys.argv[1]).get("status",""))
PY
)
  echo "status=$STATUS"
  [ "$STATUS" = "completed" ] && break
  [ "$STATUS" = "failed" ] && break
  sleep 1
done
```

## 5) Verify export endpoints
```bash
curl -sS -o /tmp/analysis-export.json \
  -H "Authorization: Bearer $ACCESS" \
  "http://localhost:8000/api/analyses/$ANALYSIS_ID/export.json"

curl -sS -o /tmp/analysis-report.md \
  -H "Authorization: Bearer $ACCESS" \
  "http://localhost:8000/api/analyses/$ANALYSIS_ID/export.md"

ls -lh /tmp/analysis-export.json /tmp/analysis-report.md
```

## 6) Validate UI flow
1. Open `http://localhost:3100/register` and create a test user
2. Open `http://localhost:3100/sources/new` and upload/paste logs
3. Open `http://localhost:3100/analyses/$ANALYSIS_ID`
4. Verify tabs, cluster detail links, search/filter, and download buttons

## Troubleshooting
```bash
docker compose logs --no-color backend --tail=200
docker compose logs --no-color worker --tail=200
docker compose logs --no-color frontend --tail=200
```

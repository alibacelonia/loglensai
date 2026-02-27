#!/bin/sh
set -eu

sh /app/scripts/wait_for_dependencies.sh

attempts="${MIGRATION_MAX_ATTEMPTS:-15}"
while [ "$attempts" -gt 0 ]; do
  if python manage.py migrate --noinput; then
    exec "$@"
  fi

  attempts=$((attempts - 1))
  echo "migration failed, retrying (${attempts} attempts remaining)"
  sleep 2
done

echo "migrations failed after maximum attempts" >&2
exit 1

#!/bin/sh
set -eu

timeout_seconds="${WAIT_TIMEOUT_SECONDS:-90}"

wait_for_service() {
  service_name="$1"
  host="$2"
  port="$3"
  remaining="$timeout_seconds"

  while [ "$remaining" -gt 0 ]; do
    if nc -z "$host" "$port" >/dev/null 2>&1; then
      return 0
    fi
    remaining=$((remaining - 1))
    sleep 1
  done

  echo "Timed out waiting for ${service_name} at ${host}:${port}" >&2
  return 1
}

wait_for_service "postgres" "${DB_HOST:-postgres}" "${DB_PORT:-5432}"
wait_for_service "redis" "${REDIS_HOST:-redis}" "${REDIS_PORT:-6379}"

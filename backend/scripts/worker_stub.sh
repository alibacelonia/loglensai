#!/bin/sh
set -eu

shutdown() {
  echo "worker received termination signal, exiting"
  exit 0
}

trap shutdown INT TERM

sh /app/scripts/wait_for_dependencies.sh

interval="${WORKER_HEARTBEAT_SECONDS:-30}"
echo "worker started and waiting for queued jobs"

while true; do
  printf 'worker heartbeat at %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  sleep "$interval"
done

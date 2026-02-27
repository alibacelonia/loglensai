#!/bin/sh
set -eu

sh /app/scripts/wait_for_dependencies.sh

port="${BACKEND_PORT:-8000}"
echo "backend started on port ${port}"

while true; do
  response='{"status":"ok","service":"backend"}'
  length="$(printf "%s" "$response" | wc -c | tr -d ' ')"
  {
    printf 'HTTP/1.1 200 OK\r\n'
    printf 'Content-Type: application/json\r\n'
    printf 'Content-Length: %s\r\n' "$length"
    printf 'Connection: close\r\n'
    printf '\r\n'
    printf '%s' "$response"
  } | nc -l -p "$port"
done

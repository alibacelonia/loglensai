#!/bin/sh
set -eu

echo "frontend started on port 80"

while true; do
  body="$(cat /app/static/index.html)"
  length="$(printf "%s" "$body" | wc -c | tr -d ' ')"
  {
    printf 'HTTP/1.1 200 OK\r\n'
    printf 'Content-Type: text/html; charset=utf-8\r\n'
    printf 'Content-Length: %s\r\n' "$length"
    printf 'Connection: close\r\n'
    printf '\r\n'
    printf '%s' "$body"
  } | nc -l -p 80
done

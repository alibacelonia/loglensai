#!/bin/sh
set -eu

sh /app/scripts/wait_for_dependencies.sh
exec "$@"

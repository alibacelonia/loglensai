#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/.env}"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.lightsail.yml"

COMMAND="deploy"
SKIP_PULL=0
SKIP_BUILD=0
SKIP_SWAP=0
SKIP_PRUNE=0
PRUNE_VOLUMES=0

SWAP_SIZE_GB="${SWAP_SIZE_GB:-2}"
PRUNE_UNTIL="${DOCKER_PRUNE_UNTIL:-168h}"
HEALTHCHECK_TIMEOUT_SECONDS="${HEALTHCHECK_TIMEOUT_SECONDS:-240}"

log() {
  printf '[lightsail-deploy] %s\n' "$*"
}

fail() {
  printf '[lightsail-deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<USAGE
Usage:
  ./infra/lightsail/deploy.sh [deploy|cleanup|status|logs] [options]

Commands:
  deploy       Deploy or update the stack (default)
  cleanup      Stop stack and prune unused Docker resources
  status       Show compose service status
  logs         Show service logs (set SERVICE=<name>, default backend)

Options:
  --env-file <path>     Path to env file (default: infra/lightsail/.env)
  --skip-pull           Skip docker compose pull
  --skip-build          Skip docker compose build on deploy
  --skip-swap           Skip swap provisioning check
  --skip-prune          Skip pre-deploy Docker prune
  --prune-volumes       Include docker volume prune (destructive for unused volumes)
  -h, --help            Show this help text

Environment knobs:
  SWAP_SIZE_GB=<int>                     Swap size to provision if missing (default: 2)
  DOCKER_PRUNE_UNTIL=<duration>          Prune filter (default: 168h)
  HEALTHCHECK_TIMEOUT_SECONDS=<seconds>  Health wait timeout (default: 240)
  SERVICE=<name>                         Logs target service (default: backend)
USAGE
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

run_as_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi

  return 127
}

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

validate_env_file() {
  [[ -f "${ENV_FILE}" ]] || fail "env file not found: ${ENV_FILE}. Create it from infra/lightsail/.env.example"

  if grep -Eq 'replace-with|insecure-dev-secret|changeme' "${ENV_FILE}"; then
    log "warning: env file still contains placeholder values"
  fi
}

ensure_swap() {
  [[ "${SKIP_SWAP}" -eq 1 ]] && return

  if ! [[ "${SWAP_SIZE_GB}" =~ ^[0-9]+$ ]] || [[ "${SWAP_SIZE_GB}" -lt 1 ]]; then
    fail "SWAP_SIZE_GB must be a positive integer"
  fi

  if swapon --show --noheadings 2>/dev/null | grep -q '.'; then
    log "swap detected; skipping swap provisioning"
    return
  fi

  log "no swap detected; provisioning ${SWAP_SIZE_GB}G swap file"

  if ! run_as_root test -w /; then
    log "warning: unable to elevate privileges; skipping swap provisioning"
    return
  fi

  if command -v fallocate >/dev/null 2>&1; then
    run_as_root fallocate -l "${SWAP_SIZE_GB}G" /swapfile
  else
    run_as_root dd if=/dev/zero of=/swapfile bs=1M count="$((SWAP_SIZE_GB * 1024))"
  fi

  run_as_root chmod 600 /swapfile
  run_as_root mkswap /swapfile >/dev/null
  run_as_root swapon /swapfile

  if ! run_as_root grep -q '^/swapfile ' /etc/fstab; then
    run_as_root sh -c "echo '/swapfile none swap sw 0 0' >> /etc/fstab"
  fi

  log "swap provisioning complete"
}

cleanup_docker() {
  log "stopping stack and pruning unused Docker resources"
  compose down --remove-orphans || true

  docker container prune -f >/dev/null || true
  docker image prune -af --filter "until=${PRUNE_UNTIL}" >/dev/null || true
  docker network prune -f >/dev/null || true
  docker builder prune -af --filter "until=24h" >/dev/null || true

  if [[ "${PRUNE_VOLUMES}" -eq 1 ]]; then
    log "pruning unused Docker volumes"
    docker volume prune -f >/dev/null || true
  fi

  docker system df || true
}

wait_for_service() {
  local service="$1"
  local start epoch_now elapsed container_id state health

  start="$(date +%s)"

  while true; do
    container_id="$(compose ps -q "${service}" 2>/dev/null || true)"
    if [[ -z "${container_id}" ]]; then
      sleep 2
    else
      state="$(docker inspect -f '{{.State.Status}}' "${container_id}" 2>/dev/null || echo unknown)"
      health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${container_id}" 2>/dev/null || echo none)"

      if [[ "${state}" == "running" && ("${health}" == "healthy" || "${health}" == "none") ]]; then
        log "service ${service} is ${state} (${health})"
        return
      fi

      if [[ "${state}" == "exited" || "${health}" == "unhealthy" ]]; then
        compose logs --no-color --tail=120 "${service}" || true
        fail "service ${service} failed to become healthy"
      fi

      sleep 2
    fi

    epoch_now="$(date +%s)"
    elapsed="$((epoch_now - start))"
    if [[ "${elapsed}" -ge "${HEALTHCHECK_TIMEOUT_SECONDS}" ]]; then
      compose logs --no-color --tail=120 "${service}" || true
      fail "timed out waiting for ${service} after ${HEALTHCHECK_TIMEOUT_SECONDS}s"
    fi
  done
}

deploy_stack() {
  ensure_swap

  if [[ "${SKIP_PRUNE}" -eq 0 ]]; then
    cleanup_docker
  fi

  if [[ "${SKIP_PULL}" -eq 0 ]]; then
    log "pulling latest base images"
    compose pull --ignore-pull-failures
  fi

  log "starting stack"
  if [[ "${SKIP_BUILD}" -eq 1 ]]; then
    compose up -d --remove-orphans
  else
    compose up -d --build --remove-orphans
  fi

  wait_for_service postgres
  wait_for_service redis
  wait_for_service backend
  wait_for_service worker
  wait_for_service frontend
  wait_for_service caddy

  compose ps
}

show_status() {
  compose ps
}

show_logs() {
  local service_name="${SERVICE:-backend}"
  compose logs --no-color --tail=200 "${service_name}"
}

parse_args() {
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      deploy|cleanup|status|logs)
        COMMAND="$1"
        shift
        ;;
      --env-file)
        [[ "$#" -ge 2 ]] || fail "--env-file requires a value"
        ENV_FILE="$2"
        shift 2
        ;;
      --skip-pull)
        SKIP_PULL=1
        shift
        ;;
      --skip-build)
        SKIP_BUILD=1
        shift
        ;;
      --skip-swap)
        SKIP_SWAP=1
        shift
        ;;
      --skip-prune)
        SKIP_PRUNE=1
        shift
        ;;
      --prune-volumes)
        PRUNE_VOLUMES=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        fail "unknown argument: $1"
        ;;
    esac
  done
}

main() {
  require_cmd docker
  validate_env_file

  case "${COMMAND}" in
    deploy)
      deploy_stack
      ;;
    cleanup)
      cleanup_docker
      ;;
    status)
      show_status
      ;;
    logs)
      show_logs
      ;;
    *)
      fail "unsupported command: ${COMMAND}"
      ;;
  esac
}

parse_args "$@"
main

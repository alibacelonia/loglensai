# Lightsail Deployment Guide

This guide deploys LogLens AI on an Amazon Lightsail VM using Docker Compose with memory-safe defaults.

## 1) Prerequisites
- Ubuntu-based Lightsail instance (2GB RAM minimum recommended)
- Docker Engine + Docker Compose plugin installed
- Repository copied to the server
- Domain DNS `A` record pointed to the Lightsail public IP (for automatic HTTPS via Caddy)

## 2) Prepare environment
```bash
cd /Users/ralphvincent/personal-projects/loglensai
make lightsail-env
```

Edit `infra/lightsail/.env` and replace all placeholder secrets before deployment.
Set `CADDY_SITE_ADDRESS` to your domain (example: `logs.example.com`).

## 3) Deploy
```bash
make lightsail-deploy
```

What this does:
- checks/provisions swap (default `2G`) if missing
- stops old containers
- prunes unused Docker artifacts to free memory/disk
- pulls images and rebuilds the stack
- waits for `postgres`, `redis`, `backend`, `worker`, `frontend`, and `caddy` to be healthy/running
- serves the app through Caddy on ports `80/443`

## 4) Operations
```bash
make lightsail-status
make lightsail-logs SERVICE=backend
make lightsail-logs SERVICE=worker
make lightsail-logs SERVICE=caddy
make lightsail-cleanup
```

Optional destructive cleanup (unused volumes):
```bash
make lightsail-cleanup-volumes
```

## 5) Useful knobs
Set these in your shell or `.env` before deploy:
- `SWAP_SIZE_GB=3` to increase swap provisioning
- `DOCKER_PRUNE_UNTIL=336h` to keep more historical image cache
- `HEALTHCHECK_TIMEOUT_SECONDS=360` for slower instances
- `LIGHTSAIL_FLAGS="--skip-pull"` to speed up repeat deploys
- `CADDY_SITE_ADDRESS=logs.example.com` for domain + automatic HTTPS

Example:
```bash
SWAP_SIZE_GB=3 LIGHTSAIL_FLAGS="--skip-pull" make lightsail-deploy
```

## 6) Compose files used
Deployment uses:
- `docker-compose.lightsail.yml`

This compose file is production-oriented (no source bind mounts) and includes Caddy, memory limits, and log rotation to reduce OOM risk.

#!/usr/bin/env bash
set -euo pipefail

# EHRbase-only deploy på Eldar (eller samma filer kopierade till
# /opt/nimloth-deploy-ehrbase-eldar/). Körs PÅ target-host — ingen SSH i
# scriptet. SCP/rsync från utvecklingsmaskin är operatörssteg (se README).
#
# Startar bara ehrbase-db + ehrbase. Rör inte fru-andersson-slice,
# openehr-composer eller GHCR-images.

cd "$(dirname "$0")"

COMPOSE=(docker compose -f docker-compose.ehrbase-only.yml -f docker-compose.eldar.yml)
EHRBASE_SERVICES=(ehrbase-db ehrbase)

usage() {
  cat >&2 <<'EOF'
Användning: ./deploy-ehrbase-eldar.sh <kommando>

  bootstrap   Validera att compose-filer finns (kör inget Docker).
  pull        docker compose pull (publika Docker Hub-images).
  up          docker compose up -d --wait för ehrbase-db + ehrbase.
  status      docker compose ps.
  down        docker compose down (volymer behålls).
  smoke       Kör smoke-ehrbase-eldar.sh mot localhost:18124.

Miljö:
  EHRBASE_HOST_PORT  (default 18124) — endast för smoke; compose-port i eldar.yml.
EOF
  exit 1
}

cmd_bootstrap() {
  echo "=== ehrbase-eldar — bootstrap (filer only) ==="
  local missing=0
  for f in docker-compose.ehrbase-only.yml docker-compose.eldar.yml smoke-ehrbase-eldar.sh; do
    if [[ -f "$f" ]]; then
      echo "  OK      $f"
    else
      echo "  SAKNAS  $f"
      missing=1
    fi
  done
  if [[ "$missing" -eq 1 ]]; then
    exit 1
  fi
  echo
  if command -v docker >/dev/null 2>&1; then
    echo "Compose merge parsar:"
    "${COMPOSE[@]}" config --quiet
    echo "OK."
  else
    echo "OBS: docker saknas — hoppar över 'compose config' (CI kör detta steg på ubuntu-latest)."
  fi
}

cmd_pull() {
  echo "=== ehrbase-eldar: pull ==="
  "${COMPOSE[@]}" pull "${EHRBASE_SERVICES[@]}"
}

cmd_up() {
  echo "=== ehrbase-eldar: up (ehrbase-db + ehrbase, host :18124) ==="
  "${COMPOSE[@]}" up -d --wait --wait-timeout 120 "${EHRBASE_SERVICES[@]}"
  echo
  "${COMPOSE[@]}" ps "${EHRBASE_SERVICES[@]}"
}

cmd_status() {
  "${COMPOSE[@]}" ps
}

cmd_down() {
  echo "=== ehrbase-eldar: down (volymer rörs inte) ==="
  "${COMPOSE[@]}" down
}

cmd_smoke() {
  local smoke="./smoke-ehrbase-eldar.sh"
  if [[ ! -x "$smoke" ]]; then
    chmod +x "$smoke"
  fi
  exec "$smoke"
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    bootstrap) cmd_bootstrap ;;
    pull) cmd_pull ;;
    up) cmd_up ;;
    status) cmd_status ;;
    down) cmd_down ;;
    smoke) cmd_smoke ;;
    *) usage ;;
  esac
}

main "$@"

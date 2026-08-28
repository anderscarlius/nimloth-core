#!/usr/bin/env bash
set -euo pipefail

# B7 — Moria pull-deploy för migration-gateway. Körs PÅ Moria, mot en
# färsk scp:ad kopia av denna fil + docker-compose.moria.yml — filerna i
# /opt/nimloth-deploy/migration-gateway/ på Moria är engångskopior,
# redigera dem ALDRIG på plats. Källan är alltid git-repot. Se
# deploy/RUNBOOK_DEPLOY.md.
#
# Delar registry-token med nimloth-compose/cohort-service:
# /opt/nimloth-deploy/.env.
#
# Användning (på Moria, efter scp):
#   IMAGE_TAG=sha-abc1234 DEPLOY_SOURCE_SHA=$(git rev-parse HEAD) ./deploy.sh
#
# Rollback: kör om med IMAGE_TAG satt till den föregående taggen som
# skrivs ut av varje körning. Nätverket och volymerna rörs aldrig av en
# rollback (S5) — bara imagetaggen byts.

: "${IMAGE_TAG:?Sätt IMAGE_TAG, t.ex. IMAGE_TAG=sha-abc1234}"
DEPLOY_SOURCE_SHA="${DEPLOY_SOURCE_SHA:-okänd — sattes inte vid körning}"

cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.moria.yml"
COMPOSE_HASH=$(sha256sum "$COMPOSE_FILE" | cut -d' ' -f1)

echo "=== migration-gateway deploy (B7, isolerad B4-kedja) ==="
echo "Käll-SHA (git):      $DEPLOY_SOURCE_SHA"
echo "Compose-fil sha256:  $COMPOSE_HASH"
echo "Ny image-tagg:       $IMAGE_TAG"
echo

ENV_FILE="/opt/nimloth-deploy/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "FEL: $ENV_FILE saknas. Se deploy/RUNBOOK_DEPLOY.md för token-placering." >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"
: "${GHCR_USER:?GHCR_USER saknas i $ENV_FILE}"
: "${GHCR_PAT:?GHCR_PAT saknas i $ENV_FILE}"

echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USER" --password-stdin

# Idempotent — skapas av VILKEN som helst av migration-gateways och
# nimloth-legacy-sims deploy.sh, beroende på vilken som körs först.
docker network inspect b4-chain >/dev/null 2>&1 || docker network create b4-chain

PREVIOUS_IMAGE=$(docker inspect migration-gateway --format '{{.Config.Image}}' 2>/dev/null || echo "(ingen körande container — första deploy)")
echo "Föregående image (rollback-referens): $PREVIOUS_IMAGE"
echo

export IMAGE_TAG
docker compose -f "$COMPOSE_FILE" pull
docker compose -f "$COMPOSE_FILE" up -d

echo
echo "--- Väntar 30s (EHRbase är långsammast) och kontrollerar status ---"
sleep 30
docker compose -f "$COMPOSE_FILE" ps

echo
echo "--- Klart. Rollback vid behov: IMAGE_TAG=<föregående-tagg-ovan> ./deploy.sh ---"

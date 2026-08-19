#!/usr/bin/env bash
set -euo pipefail

# Moria pull-deploy för cohort-service. Körs PÅ Moria, mot en färsk
# scp:ad kopia av denna fil + docker-compose.moria.yml — filerna i
# /opt/cohort-service-deploy/ på Moria är engångskopior, redigera dem
# ALDRIG på plats. Källan är alltid git-repot (deploy/deploy.sh +
# deploy/docker-compose.moria.yml under services/cohort-service/). Se
# deploy/RUNBOOK_DEPLOY.md.
#
# Delar registry-token med nimloth-compose: /opt/nimloth-deploy/.env,
# en rotationspunkt för båda tjänsterna.
#
# Användning (på Moria, efter scp):
#   IMAGE_TAG=sha-abc1234 DEPLOY_SOURCE_SHA=$(git rev-parse HEAD) ./deploy.sh
#
# Rollback: kör om med IMAGE_TAG satt till den föregående taggen som
# skrivs ut av varje körning.

: "${IMAGE_TAG:?Sätt IMAGE_TAG, t.ex. IMAGE_TAG=sha-abc1234}"
DEPLOY_SOURCE_SHA="${DEPLOY_SOURCE_SHA:-okänd — sattes inte vid körning}"

cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.moria.yml"
COMPOSE_HASH=$(sha256sum "$COMPOSE_FILE" | cut -d' ' -f1)

echo "=== cohort-service deploy ==="
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

PREVIOUS_IMAGE=$(docker inspect cohort-service-core --format '{{.Config.Image}}' 2>/dev/null || echo "(ingen körande container — första deploy)")
echo "Föregående image (rollback-referens): $PREVIOUS_IMAGE"
echo

export IMAGE_TAG
docker compose -f "$COMPOSE_FILE" pull
docker compose -f "$COMPOSE_FILE" up -d

echo
echo "--- Väntar 20s (start_period i healthcheck) och kontrollerar status ---"
sleep 20
docker compose -f "$COMPOSE_FILE" ps

echo
echo "--- Klart. Rollback vid behov: IMAGE_TAG=<föregående-tagg-ovan> ./deploy.sh ---"

#!/usr/bin/env bash
# WP-B72 — CI-facit utan hemligheter (ingen full stack-up på GHA).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== WP-B72 CI facit ==="

echo "→ bash -n deploy/b72-slice/*.sh"
bash -n deploy/b72-slice/from-scratch-local.sh
bash -n deploy/b72-slice/smoke-b72-health.sh

echo "→ Eldar ehrbase compose merge"
docker compose \
  -f deploy/core-slice/docker-compose.ehrbase-only.yml \
  -f deploy/core-slice/docker-compose.eldar.yml \
  config --quiet

echo "→ GHCR Moria-skiss (facit-config only, deploy/b72-slice/.env.ci-facit)"
set -a
# shellcheck disable=SC1091
source deploy/b72-slice/.env.ci-facit
set +a
docker compose -f deploy/core-slice/docker-compose.moria.yml config --quiet

echo "→ B4 CI compose merge (ingen ghcr-login)"
IMAGE_TAG_GATEWAY=sha-ci-facit IMAGE_TAG_LEGACY_SIM=latest \
  docker compose -f services/migration-gateway/deploy/ci/docker-compose.ci.yml config --quiet

echo "→ deploy-ehrbase-eldar bootstrap (filer only)"
(cd deploy/core-slice && ./deploy-ehrbase-eldar.sh bootstrap)

echo "=== WP-B72 CI facit: OK ==="

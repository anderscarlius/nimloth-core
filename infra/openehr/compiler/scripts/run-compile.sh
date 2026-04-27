#!/usr/bin/env bash
# Kör compilern mot ../archetypes/, output till ../templates/.
#
# Bygger imagen om den inte finns lokalt. Kallas av `pnpm openehr:compile`.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../../.." && pwd)"
ARCHETYPES="${ROOT_DIR}/infra/openehr/archetypes"
TEMPLATES="${ROOT_DIR}/infra/openehr/templates"

IMAGE="${IMAGE:-nimloth-core/openehr-compiler:0.1.0}"

if ! docker image inspect "${IMAGE}" >/dev/null 2>&1; then
  echo "Image ${IMAGE} finns inte lokalt — bygger nu."
  bash "${ROOT_DIR}/infra/openehr/compiler/scripts/build-image.sh"
fi

echo "Kompilerar ADL → OPT..."
docker run --rm \
  -v "${ARCHETYPES}:/archetypes:ro" \
  -v "${TEMPLATES}:/templates" \
  "${IMAGE}" \
  /archetypes /templates

echo "Klart. Output i ${TEMPLATES}"

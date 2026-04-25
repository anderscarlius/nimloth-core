#!/usr/bin/env bash
# Multi-arch Docker-build (linux/amd64 + linux/arm64) via buildx bake.
# Default: bygger ALLA tjänster till buildx-cache.
# Flaggor:
#   --push    pusha till registry (kräver REGISTRY-env)
#   --load    ladda native arch in i lokal docker (single-platform only)
#   --native  bygg bara native arch (fort)

set -euo pipefail
cd "$(dirname "$0")/.."

REGISTRY="${REGISTRY:-nimloth-core}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
PUSH=false
LOAD=false
NATIVE=false

for arg in "$@"; do
  case "$arg" in
    --push) PUSH=true ;;
    --load) LOAD=true ;;
    --native) NATIVE=true ;;
    *) echo "Okänd flagga: $arg"; exit 1 ;;
  esac
done

if [ "$NATIVE" = true ]; then
  PLATFORMS=$(docker version --format '{{.Server.Os}}/{{.Server.Arch}}')
  LOAD=true
fi

# Säkerställ att core-builder finns
if ! docker buildx inspect core-builder >/dev/null 2>&1; then
  echo "🔧 Skapar core-builder (docker-container driver)..."
  docker buildx create --name core-builder --driver docker-container --bootstrap --use
else
  docker buildx use core-builder
fi

SERVICES=(ingest transform fhir-facade cds-hooks audit dashboard edge)

echo "🐳 Bygger ${#SERVICES[@]} images för platforms: ${PLATFORMS}"
echo ""

BUILD_FLAGS=(--platform "$PLATFORMS")
if [ "$PUSH" = true ]; then
  BUILD_FLAGS+=(--push)
  echo "   → push till registry: ${REGISTRY}"
elif [ "$LOAD" = true ]; then
  BUILD_FLAGS+=(--load)
  echo "   → --load: laddar till lokal Docker (single-platform)"
else
  # Bara cache — ingen output. Användbart för validation.
  echo "   → bara cache (ingen --push eller --load)"
fi
echo ""

for svc in "${SERVICES[@]}"; do
  echo "📦 Bygger ${svc}..."
  docker buildx build \
    "${BUILD_FLAGS[@]}" \
    -t "${REGISTRY}/${svc}:latest" \
    -f "services/${svc}/Dockerfile" \
    .
done

echo ""
echo "✅ Klart. Images:"
for svc in "${SERVICES[@]}"; do
  echo "  ${REGISTRY}/${svc}:latest"
done

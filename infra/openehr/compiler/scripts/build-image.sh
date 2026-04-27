#!/usr/bin/env bash
# Bygger Nimloth Core openEHR Compiler-imagen.
#
# Användning:
#   ./build-image.sh                  # tag: nimloth-core/openehr-compiler:0.1.0
#   VERSION=0.2.0 ./build-image.sh    # custom version
#   IMAGE_NAME=foo ./build-image.sh   # custom image name

set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-nimloth-core/openehr-compiler}"
VERSION="${VERSION:-0.1.0}"
NO_CACHE="${NO_CACHE:-false}"

cd "$(dirname "$0")/.."

BUILD_FLAGS=()
if [[ "$NO_CACHE" == "true" ]]; then
  BUILD_FLAGS+=("--no-cache")
fi

docker build \
  "${BUILD_FLAGS[@]}" \
  --tag "${IMAGE_NAME}:${VERSION}" \
  --tag "${IMAGE_NAME}:latest" \
  .

echo ""
echo "Byggd: ${IMAGE_NAME}:${VERSION}"
docker image inspect "${IMAGE_NAME}:${VERSION}" --format='Storlek: {{.Size}} bytes'

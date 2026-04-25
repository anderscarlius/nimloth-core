#!/usr/bin/env bash
# Stoppar alla Nimloth Core-containers (behåller volymer).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "🛑 Stoppar Nimloth Core..."
docker compose -f docker-compose.yml -f docker-compose.distributed.yml --profile edge-su down 2>/dev/null \
  || docker compose down
echo "✅ Stoppad. Volymer bevarade — kör ./scripts/reset.sh för att rensa."

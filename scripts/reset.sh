#!/usr/bin/env bash
# Hård reset — stoppar allt och tar bort volymer (databaser, Kafka-logs).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "🧼 Reset: stoppar containers och tar bort volymer..."
docker compose -f docker-compose.yml -f docker-compose.distributed.yml --profile edge-su down -v 2>/dev/null \
  || docker compose down -v
echo "✅ Klar. Nästa ./scripts/start.sh blir en ren start."

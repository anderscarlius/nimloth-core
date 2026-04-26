#!/usr/bin/env bash
# Nimloth Core — startscript.
# Usage:
#   ./scripts/start.sh              # single-node
#   ./scripts/start.sh --distributed # single-node + edge-su-profil (Prompt 13+)

set -euo pipefail

cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

DISTRIBUTED=false
if [ "${1:-}" = "--distributed" ]; then
  DISTRIBUTED=true
fi

if [ "$DISTRIBUTED" = true ]; then
  echo -e "${CYAN}🌐 Nimloth Core — Distribuerat läge${NC}"
else
  echo -e "${CYAN}🏥 Nimloth Core — Single-node${NC}"
fi

wait_healthy() {
  local service="$1"
  local timeout="${2:-60}"
  local i=0
  while [ $i -lt $timeout ]; do
    status=$(docker compose ps "$service" --format "{{.Status}}" 2>/dev/null || echo "")
    if echo "$status" | grep -q healthy; then
      return 0
    fi
    sleep 2
    i=$((i + 2))
  done
  echo -e "  ${YELLOW}⚠️  ${service} blev inte healthy inom ${timeout}s${NC}"
  return 1
}

# 1. Infrastruktur (databaser + Kafka)
echo -e "${GREEN}📦 [1/6]${NC} Startar infrastruktur (DB + Kafka + Schema Registry + Keycloak + UI)..."
docker compose up -d melior-db asynja-db core-db kafka schema-registry kafka-ui keycloak >/dev/null
wait_healthy kafka 90

# 2. Kafka topics
echo -e "${GREEN}📨 [2/6]${NC} Skapar Kafka topics..."
docker compose exec -T kafka bash /opt/kafka/create-topics.sh 2>&1 | tail -1

# 3. Kafka Connect + Debezium-connectors
echo -e "${GREEN}🔌 [3/6]${NC} Startar Kafka Connect..."
docker compose up -d kafka-connect >/dev/null
wait_healthy kafka-connect 90
echo -e "${GREEN}🔗 [3/6]${NC} Registrerar Debezium-connectors..."
./infra/debezium/register-connectors.sh 2>&1 | tail -4

# 4. Seed testdata (idempotent — TRUNCATE CASCADE + INSERT)
echo -e "${GREEN}🌱 [4/6]${NC} Seedar testdata (Fru Andersson + 10 patienter)..."
pnpm --filter @nimloth-core/test-data seed:all 2>&1 | tail -6

# 5. Applikationstjänster
echo -e "${GREEN}🚀 [5/6]${NC} Startar applikationstjänster..."
docker compose up -d terminology ingest transform fhir-facade cds-hooks audit dashboard >/dev/null

# 6. Distribuerade edge-noder (om aktiverat)
if [ "$DISTRIBUTED" = true ]; then
  echo -e "${GREEN}🌍 [6/6]${NC} Startar distribuerade edge-noder (profil: edge-su)..."
  docker compose -f docker-compose.yml -f docker-compose.distributed.yml --profile edge-su up -d >/dev/null 2>&1 || \
    echo -e "  ${YELLOW}⚠️  edge-profil finns som skelett — fylls i Prompt 13${NC}"
else
  echo -e "${GREEN}✅ [6/6]${NC} Single-node klar."
fi

echo ""
echo -e "${CYAN}=========================================${NC}"
echo -e "${GREEN}✅ Nimloth Core är igång!${NC}"
echo ""
echo -e "  🌐 Dashboard:         http://localhost:3010"
echo -e "  🔥 FHIR Facade:       http://localhost:3003/fhir/r4"
echo -e "  🧠 CDS Hooks:         http://localhost:3004/cds-services"
echo -e "  🔒 Audit API:         http://localhost:3005/audit/stats"
echo -e "  📊 Kafka UI:          http://localhost:8080"
echo -e "  🔑 Keycloak:          http://localhost:8180"
echo ""
echo -e "  🧪 Demo: ${YELLOW}./scripts/demo-fru-andersson.sh${NC}"
echo -e "  🚨 Akutscenario: ${YELLOW}./scripts/simulate-emergency.sh${NC}"
echo -e "  🧼 Stopp: ${YELLOW}./scripts/stop.sh${NC} eller ${YELLOW}./scripts/reset.sh${NC} (wipe:ar volymer)"
echo ""

#!/usr/bin/env bash
# Nimloth Core — distribuerat start-script.
# Startar central + edge-su + replication i ett kommando.
#
# Ekvivalent med:  ./scripts/start.sh --distributed
# men explicit — för demoscenarion där vi vill visa alla steg.

set -euo pipefail

cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}🌐 Nimloth Core — Distributed Mode${NC}"
echo -e "${CYAN}==================================${NC}"
echo ""

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.distributed.yml"

wait_healthy() {
  local service="$1"
  local timeout="${2:-90}"
  local i=0
  while [ $i -lt $timeout ]; do
    status=$($COMPOSE ps "$service" --format "{{.Status}}" 2>/dev/null || echo "")
    if echo "$status" | grep -q healthy; then
      return 0
    fi
    sleep 2
    i=$((i + 2))
  done
  echo -e "  ${YELLOW}⚠️  ${service} blev inte healthy inom ${timeout}s${NC}"
  return 1
}

# 1. Central infrastruktur
echo -e "${GREEN}📦 [1/7]${NC} Central infrastruktur (DB + Kafka + Schema Registry + Keycloak)..."
docker compose up -d melior-db asynja-db core-db kafka schema-registry kafka-ui keycloak >/dev/null
wait_healthy kafka 90

# 2. Kafka topics (inkl. core.shared.* och core.system.edge.heartbeat)
echo -e "${GREEN}📨 [2/7]${NC} Skapar Kafka topics..."
docker compose exec -T kafka bash /opt/kafka/create-topics.sh 2>&1 | tail -1

# 3. Kafka Connect + Debezium
echo -e "${GREEN}🔌 [3/7]${NC} Startar Kafka Connect + registrerar connectors..."
docker compose up -d kafka-connect >/dev/null
wait_healthy kafka-connect 90
./infra/debezium/register-connectors.sh 2>&1 | tail -4

# 4. Seed testdata
echo -e "${GREEN}🌱 [4/7]${NC} Seedar testdata (Fru Andersson + 10 patienter)..."
pnpm --filter @nimloth-core/test-data seed:all 2>&1 | tail -4

# 5. Centrala applikationstjänster
# --build krävs för att kod-ändringar ska propagera till körande containers.
# Se scripts/start.sh + Sprint 2.5 B2 för bakgrund.
echo -e "${GREEN}🚀 [5/7]${NC} Startar centrala applikationstjänster (rebuild via --build)..."
docker compose up -d --build terminology ingest transform fhir-facade cds-hooks audit dashboard >/dev/null

# 6. Edge-nod SU + replication-tjänst (profil edge-su startar båda)
echo -e "${GREEN}🏥 [6/7]${NC} Startar edge-nod SU + replikeringstjänst..."
$COMPOSE --profile edge-su up -d --build edge-kafka-su edge-su replication >/dev/null 2>&1
wait_healthy edge-kafka-su 60

# 7. Vänta på att edge hydrerar cachen
echo -e "${GREEN}⏳ [7/7]${NC} Väntar på edge-hydrering (HTTP bootstrap + Kafka inbound)..."
sleep 15

echo ""
echo -e "${CYAN}=========================================${NC}"
echo -e "${GREEN}✅ Distribuerat läge är igång!${NC}"
echo ""
echo -e "  🌐 Dashboard:              http://localhost:3010"
echo -e "  🕸️  Topologi-vy:            http://localhost:3010/topology"
echo -e "  🔥 Central FHIR:           http://localhost:3003/fhir/r4"
echo -e "  🏥 Edge SU FHIR (lokal):   http://localhost:4003/fhir/r4"
echo -e "  🧠 Edge SU CDS (lokal):    http://localhost:4004/cds-services"
echo -e "  📊 Edge SU status:         http://localhost:4006/health"
echo -e "  🔁 Replication:            http://localhost:3007/topology"
echo -e "  📨 Kafka UI:               http://localhost:8080"
echo ""
echo -e "  🧪 Demos:"
echo -e "    ${YELLOW}./scripts/simulate-network-failure.sh${NC}      # offline → reconnect + sync"
echo -e "    ${YELLOW}./scripts/simulate-emergency-transfer.sh${NC}   # Fru Andersson via edge"
echo -e "    ${YELLOW}pnpm --filter @nimloth-core/e2e test:distributed${NC}     # E2E-tester"
echo ""
echo -e "  🧼 Stopp: ${YELLOW}./scripts/stop.sh${NC} eller ${YELLOW}./scripts/reset.sh${NC}"
echo ""

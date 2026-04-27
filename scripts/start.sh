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
# Auto-detektera kafka-connect host-port (override.yml flyttar 8083→13083 vid
# parallelldrift med nimloth-flow). Faller tillbaka på 8083 om port 13083 inte
# är publicerad.
CONNECT_HOST_PORT=$(docker compose port kafka-connect 8083 2>/dev/null | sed 's/.*://')
CONNECT_URL="${CONNECT_URL:-http://localhost:${CONNECT_HOST_PORT:-8083}}" \
  ./infra/debezium/register-connectors.sh 2>&1 | tail -4

# 4. Seed testdata (idempotent — TRUNCATE CASCADE + INSERT)
echo -e "${GREEN}🌱 [4/6]${NC} Seedar testdata (Fru Andersson + 10 patienter)..."
# Auto-detektera DB host-portar (override.yml flyttar 5433/5434 → 10433/10434
# vid parallelldrift med nimloth-flow). Faller tillbaka på defaults om
# portarna inte är publicerade.
MELIOR_PORT=$(docker compose port melior-db 5432 2>/dev/null | sed 's/.*://')
ASYNJA_PORT=$(docker compose port asynja-db 5432 2>/dev/null | sed 's/.*://')
MELIOR_DB_PORT="${MELIOR_PORT:-5433}" \
  ASYNJA_DB_PORT="${ASYNJA_PORT:-5434}" \
  pnpm --filter @nimloth-core/test-data seed:all 2>&1 | tail -6

# 5. Applikationstjänster
echo -e "${GREEN}🚀 [5/6]${NC} Startar applikationstjänster..."
docker compose up -d terminology ingest transform fhir-facade cds-hooks audit dashboard mapping-assistant >/dev/null

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
# Auto-detektera faktiska host-portar (override.yml flyttar dem vid
# parallelldrift med nimloth-flow). Faller tillbaka på defaults vid behov.
host_port() { docker compose port "$1" "$2" 2>/dev/null | sed 's/.*://' | head -1 || echo "$2"; }
P_DASH=$(host_port dashboard 3000); P_DASH=${P_DASH:-3010}
P_FHIR=$(host_port fhir-facade 3003); P_FHIR=${P_FHIR:-3003}
P_CDS=$(host_port cds-hooks 3004); P_CDS=${P_CDS:-3004}
P_AUDIT=$(host_port audit 3005); P_AUDIT=${P_AUDIT:-3005}
P_MAPPING=$(host_port mapping-assistant 3009); P_MAPPING=${P_MAPPING:-3009}
P_KUI=$(host_port kafka-ui 8080); P_KUI=${P_KUI:-8080}
P_KC=$(host_port keycloak 8080); P_KC=${P_KC:-8180}
echo -e "  🌐 Dashboard:         http://localhost:${P_DASH}"
echo -e "  🔥 FHIR Facade:       http://localhost:${P_FHIR}/fhir/r4"
echo -e "  🧠 CDS Hooks:         http://localhost:${P_CDS}/cds-services"
echo -e "  🔒 Audit API:         http://localhost:${P_AUDIT}/audit/stats"
echo -e "  🤖 Mapping Assistant: http://localhost:${P_MAPPING}/system-status"
echo -e "  🤖 Mappings-vy:       http://localhost:${P_DASH}/mappings"
echo -e "  📊 Kafka UI:          http://localhost:${P_KUI}"
echo -e "  🔑 Keycloak:          http://localhost:${P_KC}"
echo ""
# Exportera portarna så att demo-fru-andersson.sh ärver dem utan att användaren
# behöver veta om override-shifftet.
DEMO_ENV_FILE=".start-env"
cat > "$DEMO_ENV_FILE" <<EOF
export FHIR_BASE=http://localhost:${P_FHIR}/fhir/r4
export CDS_BASE=http://localhost:${P_CDS}
export AUDIT_BASE=http://localhost:${P_AUDIT}
export MAPPING_BASE=http://localhost:${P_MAPPING}
export DASHBOARD_URL=http://localhost:${P_DASH}
EOF
echo -e "  🧪 Demo: ${YELLOW}./scripts/demo-fru-andersson.sh${NC}"
echo -e "  🚨 Akutscenario: ${YELLOW}./scripts/simulate-emergency.sh${NC}"
echo -e "  🧼 Stopp: ${YELLOW}./scripts/stop.sh${NC} eller ${YELLOW}./scripts/reset.sh${NC} (wipe:ar volymer)"
echo ""

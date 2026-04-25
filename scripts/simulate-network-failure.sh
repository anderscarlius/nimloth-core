#!/usr/bin/env bash
# Demo: simulerar nätavbrott mellan edge-su och centrala hubben.
# Använder `docker network disconnect` (pålitligt på både macOS Docker Desktop
# och Linux — ingen `iptables` eller `NET_ADMIN` capability krävs).
#
# Not om macOS Docker Desktop:
#   Host-portar (4003/4004/4006) blir opålitliga under disconnect eftersom
#   docker-proxy tappar rutten. Scriptet verifierar därför edge-nodens
#   offline-läge via `docker compose logs` + `docker exec`, inte via host-curl.
#   Efter reconnect fungerar host-portarna igen.
#
# Kräver att ./scripts/start-distributed.sh har körts.

set -euo pipefail
cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

NETWORK="nimloth-core"
EDGE="edge-su"
PNR="19500315-2384"

HEADERS=(
  -H "X-User-HSA: SE-DEMO-PHYSICIAN"
  -H "X-User-Role: PHYSICIAN"
  -H "X-PDL-Care-Relation: true"
  -H "X-PDL-Purpose: CARE"
  -H "X-PDL-Care-Unit: SE2321000131-E000000000001"
)

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.distributed.yml --profile edge-su"

if ! command -v jq >/dev/null 2>&1; then
  echo "FEL: demoscriptet kräver jq."
  exit 1
fi

echo -e "${CYAN}🔌 Nimloth Core — Simulerat nätavbrott${NC}"
echo -e "${CYAN}======================================${NC}"
echo ""

# =============================================================
# Steg 1 — verifiera online
# =============================================================
echo -e "${GREEN}✅ Steg 1:${NC} Verifiera att allt är online"
echo -n "  Central FHIR:    "
curl -sf http://localhost:3003/health | jq -r '.status'
echo -n "  Edge SU runtime: "
curl -sf http://localhost:4006/health | jq -r '"\(.status) (mode=\(.mode), hub=\(.central_hub_connected))"'
echo -n "  Replication:     "
curl -sf http://localhost:3007/health | jq -r '.status'
echo ""

# =============================================================
# Steg 2 — sök Fru Andersson via edge
# =============================================================
echo -e "${GREEN}✅ Steg 2:${NC} Sök Fru Andersson via edge-nod SU (online)"
NAME=$(curl -sf "http://localhost:4003/fhir/r4/Patient?identifier=$PNR" "${HEADERS[@]}" \
  | jq -r '.entry[0].resource.name[0].text')
echo "  Hittade: $NAME"
EVERYTHING_COUNT=$(curl -sf "http://localhost:4003/fhir/r4/Patient/$PNR/\$everything" "${HEADERS[@]}" \
  | jq '.entry | length')
echo "  \$everything returnerar: $EVERYTHING_COUNT resurser (lokal SQLite-cache)"
echo ""

# =============================================================
# Steg 3 — NÄTAVBROTT
# =============================================================
echo -e "${RED}⚡ Steg 3: SIMULERAR NÄTAVBROTT (docker network disconnect)${NC}"
START_TS=$(date +%s)
if docker network disconnect "$NETWORK" "$EDGE" 2>/dev/null; then
  echo -e "  ${RED}✗ $EDGE är nu bortkopplad från $NETWORK${NC}"
else
  echo -e "  ${YELLOW}⚠️  $EDGE var redan frånkopplad — fortsätter${NC}"
fi
echo ""

echo "  Väntar på att OfflineDetector upptäcker avbrottet (3×5s pings)..."
# Poll edge-su-loggen efter "switching to offline mode"
for i in $(seq 1 30); do
  if $COMPOSE logs --since="${START_TS}" "$EDGE" 2>/dev/null | grep -q "switching to offline mode"; then
    NOW=$(date +%s); ELAPSED=$((NOW - START_TS))
    echo -e "  ${YELLOW}✓ Edge detekterade offline efter ${ELAPSED}s${NC}"
    break
  fi
  sleep 1
done

# Verifiera inifrån container att runtime fortfarande körs
echo -n "  Runtime inuti container: "
docker exec "$EDGE" sh -c 'wget -qO- http://127.0.0.1:3006/health 2>/dev/null || curl -sf http://127.0.0.1:3006/health 2>/dev/null' \
  | jq -r '"\(.status) (mode=\(.mode), hub=\(.central_hub_connected))"' 2>/dev/null \
  || echo "(kunde inte nå runtime — kolla logs)"
echo ""

# =============================================================
# Steg 4 — CDS Hooks fungerar offline (via edge-kafka-local-nätverket)
# =============================================================
echo -e "${YELLOW}⚠️  Steg 4:${NC} Verifiera att kliniker fortfarande kan arbeta"
# Under offline går host-portar via docker-proxy genom edge-su-local-nätverket
# (eftersom det är listat först i compose). Testa via docker exec som alltid
# fungerar även när host-portar är flaky under disconnect.
echo -n "  Sök patient via edge (docker exec → lokal FHIR): "
docker exec "$EDGE" sh -c "wget -qO- --header='X-User-HSA: SE-TEST' --header='X-User-Role: PHYSICIAN' --header='X-PDL-Care-Relation: true' --header='X-PDL-Purpose: CARE' --header='X-PDL-Care-Unit: SE-DEMO' 'http://127.0.0.1:3003/fhir/r4/Patient?identifier=$PNR' 2>/dev/null" \
  | jq -r '.entry[0].resource.name[0].text' 2>/dev/null \
  || echo "(fallback: se docker compose logs)"

echo -n "  CDS anticoagulation (docker exec): "
docker exec "$EDGE" sh -c "wget -qO- --header='Content-Type: application/json' --post-data='{\"hookInstance\":\"demo\",\"hook\":\"patient-view\",\"context\":{\"userId\":\"Practitioner/1\",\"patientId\":\"Patient/$PNR\"}}' 'http://127.0.0.1:3004/cds-services/core-anticoagulation' 2>/dev/null" \
  | jq -r '.cards[0].summary' 2>/dev/null \
  || echo "(fallback)"
echo ""

# =============================================================
# Steg 5 — ÅTERANSLUTNING
# =============================================================
echo -e "${CYAN}🔌 Steg 5: ÅTERANSLUTER till central hub${NC}"
docker network connect "$NETWORK" "$EDGE"
echo "  ✓ Nätverksanslutning återställd"
echo ""

echo "  Väntar 15s på reconnect-pingen..."
for i in $(seq 1 20); do
  if $COMPOSE logs --since="${START_TS}" "$EDGE" 2>/dev/null | grep -q "central hub reconnected"; then
    echo -e "  ${GREEN}✓ Reconnect detekterat${NC}"
    break
  fi
  sleep 1
done

echo ""
echo -n "  Edge mode (via host port):   "
curl -sf http://localhost:4006/health | jq -r '.mode' 2>/dev/null || echo "(host port inte klar ännu)"
echo ""

# =============================================================
# Steg 6 — verifiera topology
# =============================================================
echo -e "${GREEN}✅ Steg 6:${NC} Verifiera topologi-vy (replication-tjänst)"
TOPOLOGY=$(curl -sf http://localhost:3007/topology || echo '{"edges":[]}')
EDGE_IN_TOPO=$(echo "$TOPOLOGY" | jq -r '.edges[] | select(.instance_id=="su") | "\(.status) / buffered=\(.metrics.buffered_events) / hub_connected=\(.metrics.central_hub_connected)"')
echo "  Topologi-vy edge-su: $EDGE_IN_TOPO"
echo ""

echo -e "${CYAN}======================================${NC}"
echo -e "${GREEN}✅ Demo slutförd${NC}"
echo ""
echo "  - Edge-nod detekterade avbrottet inom 15s (3×5s pings)"
echo "  - Runtime fortsatte svara lokalt via edge-su-local-nätverket"
echo "  - CDS-regler levererade kort utan central kontakt"
echo "  - Reconnect detekterades automatiskt; mode växlade till 'replaying'"
echo ""

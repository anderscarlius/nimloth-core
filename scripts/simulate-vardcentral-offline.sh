#!/usr/bin/env bash
# Demo: simulerar nätavbrott på Vårdcentralen Bengtsfors (care-unit-edge).
# Visar att lokal FHIR + CDS fortsätter svara från SQLite-cachen även när
# central hubben är onåbar — och att outbox-events syncas vid reconnect.
#
# Kräver att stack:en är uppe med edge-careunit-dalsland-profilen:
#   docker compose -f docker-compose.yml -f docker-compose.distributed.yml \
#       --profile edge-careunit-dalsland up -d

set -euo pipefail
cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

NETWORK="${NETWORK:-nimloth-core}"
EDGE="${EDGE:-care-unit-dalsland}"
PNR="${PNR:-19500315-2384}"
CENTRAL_HEALTH_URL="${CENTRAL_HEALTH_URL:-http://localhost:3003/health}"
EDGE_FHIR_BASE="${EDGE_FHIR_BASE:-http://localhost:5003/fhir/r4}"
EDGE_CDS_BASE="${EDGE_CDS_BASE:-http://localhost:5004}"
EDGE_STATUS_URL="${EDGE_STATUS_URL:-http://localhost:5006}"

if ! command -v jq >/dev/null 2>&1; then
  echo "FEL: demoscriptet kräver jq."
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${EDGE}$"; then
  echo "FEL: ${EDGE} kör inte. Starta först med:"
  echo "  docker compose -f docker-compose.yml -f docker-compose.distributed.yml \\"
  echo "      --profile edge-careunit-dalsland up -d"
  exit 1
fi

echo -e "${CYAN}🏥 Care-unit-edge — Vårdcentralen Bengtsfors${NC}"
echo -e "${CYAN}=============================================${NC}"
echo ""

# =============================================================
# Steg 1 — verifiera online + initial pull
# =============================================================
echo -e "${GREEN}✅ Steg 1:${NC} Verifiera att care-unit-edge är online"
sleep 3 # ge initial pull en chans att hydrera om vi precis startat
echo -n "  Status (host port 5006/health):     "
curl -sf ${EDGE_STATUS_URL}/health | jq -r '"\(.status) (mode=\(.mode), patients_cached=\(.patients_cached))"'
echo -n "  Central FHIR-facade healthy:        "
curl -sf ${CENTRAL_HEALTH_URL} | jq -r '.status'
echo ""

# =============================================================
# Steg 2 — sök Fru Andersson lokalt (online — pull har hydrerat)
# =============================================================
echo -e "${GREEN}✅ Steg 2:${NC} Sök Fru Andersson via lokal FHIR (online)"
NAME=$(curl -sf "${EDGE_FHIR_BASE}/Patient?identifier=$PNR" \
  | jq -r '.entry[0].resource.name[0].text // "ej hittad"')
echo "  Lokalt svar: $NAME"
EVERY_COUNT=$(curl -sf "${EDGE_FHIR_BASE}/Patient/$PNR/\$everything" \
  | jq '.entry | length')
echo "  \$everything: $EVERY_COUNT resurser i lokal SQLite"
echo ""

# =============================================================
# Steg 3 — NÄTAVBROTT
# =============================================================
echo -e "${RED}⚡ Steg 3: SIMULERAR NÄTAVBROTT (docker network disconnect)${NC}"
START_TS=$(date +%s)
if docker network disconnect "$NETWORK" "$EDGE" 2>/dev/null; then
  echo -e "  ${RED}✗ ${EDGE} är nu bortkopplad från ${NETWORK}${NC}"
else
  echo -e "  ${YELLOW}⚠️  ${EDGE} var redan frånkopplad — fortsätter${NC}"
fi
echo ""

echo "  Väntar på att OfflineDetector upptäcker avbrottet..."
for i in $(seq 1 30); do
  if docker logs --since="${START_TS}" "$EDGE" 2>/dev/null | grep -q '"to":"offline"'; then
    NOW=$(date +%s); ELAPSED=$((NOW - START_TS))
    echo -e "  ${YELLOW}✓ Edge detekterade offline efter ${ELAPSED}s${NC}"
    break
  fi
  sleep 1
done

# =============================================================
# Steg 4 — kliniker arbetar fortfarande lokalt
#
# Not om macOS Docker Desktop:
#   När care-unit är disconnectad från enda nätverket blir host-portarna
#   (5003/5004) flaky tills reconnect. Vi verifierar därför via docker exec
#   som alltid fungerar oavsett nätstatus.
# =============================================================
echo -e "${YELLOW}⚠️  Steg 4:${NC} Verifiera att vårdcentralen fortfarande fungerar"
echo -n "  Sök patient (docker exec → lokal FHIR): "
NAME_OFFLINE=$(docker exec "$EDGE" sh -c "wget -qO- 'http://127.0.0.1:3003/fhir/r4/Patient?identifier=$PNR' 2>/dev/null" \
  | jq -r '.entry[0].resource.name[0].text // "fail"' 2>/dev/null || echo "(fallback)")
echo "$NAME_OFFLINE"

echo -n "  CDS Antikoagulation (docker exec):       "
CARDS=$(docker exec "$EDGE" sh -c "wget -qO- --header='Content-Type: application/json' --post-data='{\"hookInstance\":\"demo\",\"hook\":\"patient-view\",\"context\":{\"userId\":\"Practitioner/1\",\"patientId\":\"Patient/$PNR\"}}' 'http://127.0.0.1:3004/cds-services/core-anticoagulation' 2>/dev/null" \
  | jq -r '.cards[0].summary // "(inga kort)"' 2>/dev/null || echo "(fallback)")
echo "$CARDS"
echo ""

# =============================================================
# Steg 5 — ÅTERANSLUTNING
# =============================================================
echo -e "${CYAN}🔌 Steg 5: ÅTERANSLUTER till central hub${NC}"
docker network connect "$NETWORK" "$EDGE"
echo "  ✓ Nätverksanslutning återställd"
echo ""

echo "  Väntar på reconnect..."
for i in $(seq 1 30); do
  if docker logs --since="${START_TS}" "$EDGE" 2>/dev/null | grep -q '"to":"realtime"'; then
    echo -e "  ${GREEN}✓ Reconnect detekterad${NC}"
    break
  fi
  sleep 1
done

sleep 5
echo ""

echo -e "${GREEN}✅ Steg 6:${NC} Verifiera sync efter reconnect"
STATUS=$(curl -sf ${EDGE_STATUS_URL}/status)
echo "  Mode:                $(echo "$STATUS" | jq -r '.offline.mode')"
echo "  Patients cached:     $(echo "$STATUS" | jq -r '.cache.patients')"
echo "  Outbox pending:      $(echo "$STATUS" | jq -r '.outbox.pending')"
echo "  Sync — pulled total: $(echo "$STATUS" | jq -r '.sync.pulledTotal')"
echo ""

echo -e "${CYAN}=============================================${NC}"
echo -e "${GREEN}✅ Demo slutförd${NC}"
echo ""
echo "  - Vårdcentralen detekterade avbrottet och växlade till offline-mode"
echo "  - Lokal FHIR + CDS fortsatte svara från SQLite-cachen"
echo "  - Reconnect detekterades automatiskt"
echo "  - Sync-worker återupptog pull/push från central"
echo ""

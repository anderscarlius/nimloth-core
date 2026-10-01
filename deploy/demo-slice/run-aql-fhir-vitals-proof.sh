#!/usr/bin/env bash
# WP-DEMO1 — bevis: samma syntetisk observation via AQL (EHRbase) och FHIR GET.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PNR="19500315-2384"
PROOF_WAIT_SECS="${PROOF_WAIT_SECS:-20}"

if ! command -v jq >/dev/null 2>&1; then
  echo "FEL: jq krävs"
  exit 1
fi

if [ -f "$ROOT/.start-env" ]; then
  # shellcheck disable=SC1091
  source "$ROOT/.start-env"
fi

host_port() {
  docker compose port "$1" "$2" 2>/dev/null | sed 's/.*://' | head -1
}

EHRBASE_PORT="$(host_port ehrbase 8080)"; EHRBASE_PORT="${EHRBASE_PORT:-8088}"
FHIR_PORT="$(host_port fhir-facade 3003)"; FHIR_PORT="${FHIR_PORT:-3003}"
KAFKA_PORT="$(host_port kafka 9092)"; KAFKA_PORT="${KAFKA_PORT:-9092}"
COMPOSER_PORT="$(host_port openehr-composer 3015)"; COMPOSER_PORT="${COMPOSER_PORT:-3015}"

EHRBASE_URL="http://localhost:${EHRBASE_PORT}/ehrbase"
FHIR="${FHIR_BASE:-http://localhost:${FHIR_PORT}/fhir/r4}"
KAFKA_BROKERS="localhost:${KAFKA_PORT}"
COMPOSER_URL="http://localhost:${COMPOSER_PORT}"

HEADERS=(-H "X-User-HSA: SE-DEMO-PHYSICIAN" -H "X-User-Role: PHYSICIAN" -H "X-PDL-Care-Relation: true" -H "X-PDL-Purpose: CARE" -H "X-PDL-Care-Unit: SE2321000131-E000000000001")

fail() { echo "FEL: $*" >&2; exit 1; }

# Unikt värde per körning (syntetiskt, inte klinisk patientdata)
MAG="$(python3 -c "import random; print(round(36.0 + random.random() * 2, 2))")"

echo "=== 1/4 — publicera syntetisk body_temperature (${MAG} °C) på Kafka ==="
PUBLISH_OUT="$(KAFKA_BROKERS_HOST="$KAFKA_BROKERS" pnpm exec tsx deploy/demo-slice/publish-synthetic-vital.ts --magnitude "$MAG")"
echo "$PUBLISH_OUT"
EVENT_ID="$(echo "$PUBLISH_OUT" | sed -n 's/^WP_DEMO1_EVENT_ID=//p')"

echo "=== 2/4 — vänta in composer + materializer (${PROOF_WAIT_SECS}s) ==="
deadline=$((SECONDS + PROOF_WAIT_SECS))
aql_ok=0
while [ "$SECONDS" -lt "$deadline" ]; do
  EHR_JSON="$(curl -sfS "${COMPOSER_URL}/composer/ehr/${PNR}" 2>/dev/null || true)"
  EHR_ID="$(echo "$EHR_JSON" | jq -r '.ehr_id // empty' 2>/dev/null || true)"
  if [ -n "$EHR_ID" ]; then
    AQL_BODY="$(python3 -c "import json; print(json.dumps({'q': '''SELECT o/data/events/data/items/value/magnitude AS mag FROM EHR e[ehr_id/value='${EHR_ID}'] CONTAINS COMPOSITION c CONTAINS OBSERVATION o[openEHR-EHR-OBSERVATION.body_temperature.v2] WHERE o/data/events/data/items/value/magnitude = ${MAG}'''}))")"
    AQL_RESP="$(curl -sfS -X POST "${EHRBASE_URL}/rest/openehr/v1/query/aql" \
      -H "Content-Type: application/json" -d "$AQL_BODY" 2>/dev/null || true)"
    ROWS="$(echo "$AQL_RESP" | jq -r '.rows | length' 2>/dev/null || echo 0)"
    if [ "${ROWS:-0}" -ge 1 ]; then
      aql_ok=1
      break
    fi
  fi
  sleep 2
done
[ "$aql_ok" -eq 1 ] || fail "AQL hittade inte magnitude=${MAG} inom ${PROOF_WAIT_SECS}s (ehr_id=${EHR_ID:-?})"
echo "OK — AQL: minst en rad med mag=${MAG} (ehr_id=${EHR_ID})"

echo "=== 3/4 — FHIR GET Observation (postgres materializer) ==="
FHIR_JSON="$(curl -sfS "${HEADERS[@]}" "${FHIR}/Observation?patient=${PNR}&category=vital-signs&_count=200")"
FHIR_MAG="$(echo "$FHIR_JSON" | jq -r --argjson mag "$MAG" '
  [.entry[]?.resource.valueQuantity.value // empty]
  | map(select(. == $mag)) | first // empty
')"
if [ -z "$FHIR_MAG" ]; then
  # BT kan ligga som component; för temperatur räcker valueQuantity
  FHIR_MAG="$(echo "$FHIR_JSON" | jq -r --argjson mag "$MAG" '
    [.entry[]?.resource | .. | objects | select(has("value")) | .value]
    | map(select(. == $mag)) | first // empty
  ')"
fi
[ -n "$FHIR_MAG" ] || fail "FHIR Observation saknar valueQuantity=${MAG} (event_id=${EVENT_ID})"
echo "OK — FHIR: valueQuantity.value=${FHIR_MAG}"

echo "=== 4/4 — jämför ==="
python3 -c "import sys; a=float('$MAG'); b=float('$FHIR_MAG'); sys.exit(0 if abs(a-b) < 0.001 else 1)" \
  || fail "AQL magnitude ${MAG} matchar inte FHIR ${FHIR_MAG}"
echo ""
echo "=== WP-DEMO1 AQL ↔ FHIR: GRÖN (syntetisk observation ${MAG} °C) ==="

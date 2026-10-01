#!/usr/bin/env bash
# Verifierar att unified demo-path har EHRbase, minst en event-path och FHIR-fasad.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [ -f "$ROOT/.start-env" ]; then
  # shellcheck disable=SC1091
  source "$ROOT/.start-env"
fi

host_port() {
  docker compose port "$1" "$2" 2>/dev/null | sed 's/.*://' | head -1
}

EHRBASE_PORT="$(host_port ehrbase 8080)"; EHRBASE_PORT="${EHRBASE_PORT:-8088}"
FHIR_PORT="$(host_port fhir-facade 3003)"; FHIR_PORT="${FHIR_PORT:-3003}"
CONNECT_PORT="$(host_port kafka-connect 8083)"; CONNECT_PORT="${CONNECT_PORT:-8083}"

EHRBASE_URL="http://localhost:${EHRBASE_PORT}/ehrbase"
FHIR_HEALTH="http://localhost:${FHIR_PORT}/health"
CONNECT_URL="http://localhost:${CONNECT_PORT}"

fail() { echo "FEL: $*" >&2; exit 1; }

echo "→ EHRbase ${EHRBASE_URL}/"
curl -sfS "${EHRBASE_URL}/" >/dev/null || fail "EHRbase svarar inte på ${EHRBASE_URL}"

echo "→ FHIR facade ${FHIR_HEALTH}"
curl -sfS "${FHIR_HEALTH}" >/dev/null || fail "fhir-facade health misslyckades"

echo "→ Kafka Connect ${CONNECT_URL}/connectors"
CONNECTORS="$(curl -sfS "${CONNECT_URL}/connectors" 2>/dev/null || echo "[]")"
CONNECTOR_COUNT="$(echo "$CONNECTORS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo 0)"
if [ "${CONNECTOR_COUNT:-0}" -lt 1 ]; then
  fail "inga Debezium-connectors registrerade — event-path (CDC) saknas"
fi
echo "   connectors: ${CONNECTOR_COUNT}"

echo "→ Kafka topic (domän) core.clinical.observation.vitals"
docker compose exec -T kafka kafka-topics --bootstrap-server localhost:29092 --describe --topic core.clinical.observation.vitals >/dev/null 2>&1 \
  || fail "topic core.clinical.observation.vitals saknas — kör create-topics.sh via start.sh"

echo "OK — EHRbase + CDC/event-path + FHIR-fasad verifierade"

#!/usr/bin/env bash
# Registrerar Debezium PostgreSQL-connectors mot Kafka Connect REST API.
#
# Användning:
#   ./infra/debezium/register-connectors.sh
#
# Idempotent — använder PUT /connectors/{name}/config.
# INSTANCE_ID och tabellprefix parametriseras via env (v2 distribuerad).

set -euo pipefail

# ============================================================
# Konfiguration
# ============================================================
INSTANCE_ID="${MELIOR_INSTANCE_ID:-su}"
MELIOR_CONNECTOR="melior-${INSTANCE_ID}-connector"
ASYNJA_CONNECTOR="asynja-connector"
MELIOR_TOPIC_PREFIX="vgr.cdc.melior.${INSTANCE_ID}"
ASYNJA_TOPIC_PREFIX="vgr.cdc.asynja"
MELIOR_DB_HOST="${MELIOR_DB_HOST:-melior-db}"
ASYNJA_DB_HOST="${ASYNJA_DB_HOST:-asynja-db}"

CONNECT_URL="${CONNECT_URL:-http://localhost:8083}"

echo "[register-connectors] instance_id=${INSTANCE_ID}"
echo "[register-connectors] connect_url=${CONNECT_URL}"
echo ""

# ============================================================
# 1. Vänta på Kafka Connect
# ============================================================
echo "[register-connectors] Väntar på Kafka Connect..."
for i in $(seq 1 60); do
  if curl -fsS "${CONNECT_URL}/connectors" >/dev/null 2>&1; then
    echo "[register-connectors] Connect ready (t=${i}s)"
    break
  fi
  sleep 1
done

if ! curl -fsS "${CONNECT_URL}/connectors" >/dev/null 2>&1; then
  echo "FEL: Kafka Connect svarar inte på ${CONNECT_URL}" >&2
  exit 1
fi

# ============================================================
# Hjälpfunktion: register (eller uppdatera) en connector via PUT
# ============================================================
register_connector() {
  local name="$1"
  local config_json="$2"

  echo "  > ${name}"
  local status
  status=$(curl -sS -o /tmp/connect-resp.json -w "%{http_code}" \
    -X PUT "${CONNECT_URL}/connectors/${name}/config" \
    -H "Content-Type: application/json" \
    --data "${config_json}")

  if [ "${status}" = "200" ] || [ "${status}" = "201" ]; then
    echo "    status=${status} (ok)"
  else
    echo "    status=${status} — response:" >&2
    cat /tmp/connect-resp.json >&2
    echo "" >&2
    return 1
  fi
}

# ============================================================
# 2. Melior-connector
# ============================================================
echo ""
echo "[register-connectors] Registrerar ${MELIOR_CONNECTOR}..."

MELIOR_CONFIG=$(cat <<JSON
{
  "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
  "tasks.max": "1",
  "database.hostname": "${MELIOR_DB_HOST}",
  "database.port": "5432",
  "database.dbname": "melior",
  "database.user": "debezium_reader",
  "database.password": "debezium",
  "plugin.name": "pgoutput",
  "publication.name": "melior_pub",
  "slot.name": "debezium_melior_${INSTANCE_ID}",
  "topic.prefix": "${MELIOR_TOPIC_PREFIX}",
  "table.include.list": "public.patients,public.encounters,public.observations,public.lab_results,public.prescriptions,public.procedures,public.clinical_notes,public.diagnoses,public.allergies,public.referrals",
  "snapshot.mode": "initial",
  "key.converter": "org.apache.kafka.connect.json.JsonConverter",
  "value.converter": "org.apache.kafka.connect.json.JsonConverter",
  "key.converter.schemas.enable": "false",
  "value.converter.schemas.enable": "false",
  "decimal.handling.mode": "double",
  "time.precision.mode": "connect",
  "transforms": "unwrap",
  "transforms.unwrap.type": "io.debezium.transforms.ExtractNewRecordState",
  "transforms.unwrap.add.fields": "op,source.ts_ms,source.table,source.lsn,source.txId",
  "transforms.unwrap.delete.handling.mode": "rewrite"
}
JSON
)

register_connector "${MELIOR_CONNECTOR}" "${MELIOR_CONFIG}"

# ============================================================
# 3. AsynjaVisph-connector
# ============================================================
echo ""
echo "[register-connectors] Registrerar ${ASYNJA_CONNECTOR}..."

ASYNJA_CONFIG=$(cat <<JSON
{
  "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
  "tasks.max": "1",
  "database.hostname": "${ASYNJA_DB_HOST}",
  "database.port": "5432",
  "database.dbname": "asynja",
  "database.user": "debezium_reader",
  "database.password": "debezium",
  "plugin.name": "pgoutput",
  "publication.name": "asynja_pub",
  "slot.name": "debezium_asynja",
  "topic.prefix": "${ASYNJA_TOPIC_PREFIX}",
  "table.include.list": "public.patients,public.encounters,public.prescriptions,public.diagnoses,public.allergies",
  "snapshot.mode": "initial",
  "key.converter": "org.apache.kafka.connect.json.JsonConverter",
  "value.converter": "org.apache.kafka.connect.json.JsonConverter",
  "key.converter.schemas.enable": "false",
  "value.converter.schemas.enable": "false",
  "decimal.handling.mode": "double",
  "time.precision.mode": "connect",
  "transforms": "unwrap",
  "transforms.unwrap.type": "io.debezium.transforms.ExtractNewRecordState",
  "transforms.unwrap.add.fields": "op,source.ts_ms,source.table,source.lsn,source.txId",
  "transforms.unwrap.delete.handling.mode": "rewrite"
}
JSON
)

register_connector "${ASYNJA_CONNECTOR}" "${ASYNJA_CONFIG}"

# ============================================================
# 4. Verifiera status (vänta tills RUNNING)
# ============================================================
echo ""
echo "[register-connectors] Verifierar connector-status..."
sleep 2

for connector in "${MELIOR_CONNECTOR}" "${ASYNJA_CONNECTOR}"; do
  for i in $(seq 1 30); do
    state=$(curl -fsS "${CONNECT_URL}/connectors/${connector}/status" 2>/dev/null \
      | grep -o '"state":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "UNKNOWN")
    if [ "${state}" = "RUNNING" ]; then
      echo "  ${connector}: RUNNING"
      break
    fi
    sleep 1
  done
  if [ "${state}" != "RUNNING" ]; then
    echo "  ${connector}: ${state} (INTE running efter 30s)" >&2
    curl -sS "${CONNECT_URL}/connectors/${connector}/status" | head -c 500 >&2
    echo "" >&2
  fi
done

echo ""
echo "[register-connectors] Klar."

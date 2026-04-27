#!/usr/bin/env bash
# Skapar alla Kafka topics för Nimloth Core.
# Körs inifrån kafka-containern (mountad via docker-compose.yml).
#
# Användning:
#   docker compose exec kafka /opt/kafka/create-topics.sh
#
# Idempotent — redan existerande topics hoppas över via --if-not-exists.

set -euo pipefail

BOOTSTRAP="${BOOTSTRAP_SERVERS:-localhost:29092}"

# Hitta kafka-topics-binären — fungerar både med apache/kafka (/opt/kafka/bin/kafka-topics.sh)
# och confluentinc/cp-kafka (kafka-topics på PATH).
if command -v kafka-topics >/dev/null 2>&1; then
  KT="kafka-topics --bootstrap-server ${BOOTSTRAP}"
elif [ -x /opt/kafka/bin/kafka-topics.sh ]; then
  KT="/opt/kafka/bin/kafka-topics.sh --bootstrap-server ${BOOTSTRAP}"
else
  echo "FEL: hittar varken kafka-topics eller kafka-topics.sh" >&2
  exit 2
fi

# Retention-konstanter (millisekunder)
RET_7D=604800000
RET_30D=2592000000
RET_90D=7776000000
RET_UNLIMITED=-1

# --if-not-exists gör skapandet idempotent
create_topic() {
  local name="$1"
  local partitions="$2"
  local retention="$3"
  local cleanup_policy="${4:-delete}"
  echo "  + ${name} (p=${partitions}, retention=${retention}ms, cleanup=${cleanup_policy})"
  ${KT} --create --if-not-exists \
    --topic "${name}" \
    --partitions "${partitions}" \
    --replication-factor 1 \
    --config "retention.ms=${retention}" \
    --config "cleanup.policy=${cleanup_policy}" \
    >/dev/null
}

echo "[create-topics] bootstrap=${BOOTSTRAP}"
echo ""

# ============================================================
# CDC Raw Topics (retention 90 dagar)
# ============================================================
echo "== CDC Raw (aggregerade) =="
create_topic "vgr.cdc.melior.su.raw" 6 "${RET_90D}"
create_topic "vgr.cdc.asynja.raw"    3 "${RET_90D}"

# ============================================================
# Debezium per-tabell-topics (prefix: vgr.cdc.melior.su.public)
# Debezium skapar dessa automatiskt vid första CDC-event, men
# pre-skapning undviker race condition mot ingest-consumers.
# ============================================================
echo ""
echo "== Debezium per-tabell (Melior) =="
for table in patients encounters observations lab_results prescriptions \
             procedures clinical_notes diagnoses allergies referrals; do
  create_topic "vgr.cdc.melior.su.public.${table}" 3 "${RET_90D}"
done

echo ""
echo "== Debezium per-tabell (AsynjaVisph) =="
for table in patients encounters prescriptions diagnoses allergies; do
  create_topic "vgr.cdc.asynja.public.${table}" 3 "${RET_90D}"
done

# ============================================================
# Domain Event Topics (retention 30 dagar)
# ============================================================
echo ""
echo "== Clinical Domain =="
create_topic "core.clinical.encounter.started"     6 "${RET_30D}"
create_topic "core.clinical.encounter.ended"       6 "${RET_30D}"
create_topic "core.clinical.observation.vitals"    6 "${RET_30D}"
create_topic "core.clinical.lab.result"            6 "${RET_30D}"
create_topic "core.clinical.medication.prescribed" 6 "${RET_30D}"
create_topic "core.clinical.medication.dispensed"  3 "${RET_30D}"
create_topic "core.clinical.note.signed"           6 "${RET_30D}"
create_topic "core.clinical.procedure.completed"   3 "${RET_30D}"
create_topic "core.clinical.referral.sent"         3 "${RET_30D}"
create_topic "core.clinical.condition.diagnosed"   3 "${RET_30D}"
create_topic "core.clinical.allergy.reported"      3 "${RET_30D}"

# ============================================================
# Admin Topics (retention 30 dagar)
# ============================================================
echo ""
echo "== Admin =="
create_topic "core.admin.patient.registered"   3 "${RET_30D}"
create_topic "core.admin.patient.transferred"  3 "${RET_30D}"
create_topic "core.admin.patient.discharged"   3 "${RET_30D}"

# ============================================================
# Audit (retention unlimited, compact+delete)
# ============================================================
echo ""
echo "== Audit =="
create_topic "core.audit.access"  6 "${RET_UNLIMITED}" "compact,delete"
create_topic "core.audit.mapping" 3 "${RET_UNLIMITED}" "compact,delete"

# ============================================================
# System (retention 7 dagar)
# ============================================================
echo ""
echo "== System =="
create_topic "core.system.quality.metrics"  1 "${RET_7D}"
create_topic "core.system.errors"           1 "${RET_7D}"

# ============================================================
# Shared + system edge-heartbeat (förberedelse för Prompt 14)
# Dessa kräver Prompt 14-implementation för att användas, men skapas nu
# så att compacted-topics redan finns vid första edge-start.
# ============================================================
echo ""
echo "== Shared (för Prompt 14) =="
create_topic "core.shared.patient-index"   6 "${RET_UNLIMITED}" "compact"
create_topic "core.shared.spar-register"   1 "${RET_UNLIMITED}" "compact"
create_topic "core.shared.cds-rules"       1 "${RET_UNLIMITED}" "compact"
create_topic "core.shared.terminology"     3 "${RET_UNLIMITED}" "compact"
create_topic "core.system.edge.heartbeat"  1 86400000 "delete"

echo ""
TOPIC_COUNT=$(${KT} --list | wc -l | tr -d ' ')
echo "[create-topics] Done — ${TOPIC_COUNT} topics on broker"

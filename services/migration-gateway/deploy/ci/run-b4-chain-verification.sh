#!/usr/bin/env bash
set -euo pipefail

# B7 nivå 1 — huvudleverans. Reser inte bara containrarna, kör hela
# B4-demot end-to-end mot dem och FÄLLER på skarpa asserts, inte bara
# "containern startade". Se B4_Demomanus_2026-08-19.md för samma flöde
# som mänsklig demo.
#
# Förutsätter: docker-compose.ci.yml uppe och friskt, node_modules
# installerat i repo-roten (pnpm install körs av workflow-steget innan
# detta skript). Körs FRÅN repo-roten (nimloth-core/).
#
# Grind 2-tillägg (2): alla asserts t.o.m. steg 9 är POSITIVA kontroller
# — jobbet skulle gå grönt även med en trasig klassificerare (den skulle
# aldrig rapportera en avvikelse den inte letar efter). Steg 10 är en
# NEGATIV kontroll: korrumpera en post på riktigt, bevisa att
# klassificeraren FAKTISKT fäller på den, städa, bevisa att den rena
# körningen är ren igen. Samma reverseringsdisciplin som B4-etapperna
# (S10) — inte blockerande för Moria-deployen enligt Anders.

COMPOSE_FILE="services/migration-gateway/deploy/ci/docker-compose.ci.yml"

GATEWAY_URL="http://localhost:11113"
LEGACY_URL="http://localhost:11601"
# Två varianter avsiktligt: openehr-client.ts/anteckning-diff.ts vill ha
# basen MED /ehrbase (matchar EHRBASE_BASE_URL i compose-filen), men
# load-bridge-templates.ts lägger till /ehrbase/ SJÄLV och vill ha
# roten UTAN — att blanda dem gav /ehrbase/ehrbase/... och ett 404 i det
# första dry-run-försöket.
EHRBASE_ROOT_URL="http://localhost:11401"
EHRBASE_URL="http://localhost:11401/ehrbase"
CARE_UNIT="ci-runner"
PATIENT_NO="ci-001"
DOMAIN="anteckning"

fail() { echo "FEL: $*" >&2; exit 1; }

echo "=== 1/9 — vänta in tjänsterna ==="
for i in $(seq 1 30); do curl -sf "$LEGACY_URL/healthz" >/dev/null && break; sleep 2; done
curl -sf "$LEGACY_URL/healthz" >/dev/null || fail "legacy-sim aldrig frisk"
for i in $(seq 1 30); do curl -sf "$GATEWAY_URL/healthz" >/dev/null && break; sleep 2; done
curl -sf "$GATEWAY_URL/healthz" >/dev/null || fail "migration-gateway aldrig frisk"
for i in $(seq 1 30); do curl -sf "$EHRBASE_URL/" >/dev/null && break; sleep 3; done
curl -sf "$EHRBASE_URL/" >/dev/null || fail "EHRbase aldrig frisk"
echo "alla tre tjänster friska"

echo "=== 2/9 — ladda progress_note.v1 (bridge-buildern, D7) ==="
EHRBASE_URL="$EHRBASE_ROOT_URL" pnpm --filter @nimloth-core/openehr-composer exec tsx \
  src/bridge/scripts/load-bridge-templates.ts

echo "=== 3/9 — skapa en EHR för CI-patienten ==="
EHR_ID=$(curl -sf -X POST "$EHRBASE_URL/rest/openehr/v1/ehr" \
  -H "Content-Type: application/json" -H "Accept: application/json" -H "Prefer: return=representation" \
  -d "{\"_type\":\"EHR_STATUS\",\"archetype_node_id\":\"openEHR-EHR-EHR_STATUS.generic.v1\",\"name\":{\"value\":\"EHR Status\"},\"subject\":{\"external_ref\":{\"id\":{\"_type\":\"GENERIC_ID\",\"value\":\"b7-ci-${PATIENT_NO}\",\"scheme\":\"id_scheme\"},\"namespace\":\"ci\",\"type\":\"PERSON\"}},\"is_queryable\":true,\"is_modifiable\":true}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['ehr_id']['value'])")
[[ -n "$EHR_ID" ]] || fail "EHR-skapande misslyckades"
echo "ehr_id=$EHR_ID"

echo "=== 4/9 — seeda identitetsmappning ==="
curl -sf -X POST "$GATEWAY_URL/identity" -H "Content-Type: application/json" \
  -d "{\"patient_no\":\"$PATIENT_NO\",\"ehr_id\":\"$EHR_ID\",\"care_unit\":\"$CARE_UNIT\"}" >/dev/null

echo "=== 5/9 — S0: skriv i legacy (LEGACY_ONLY är default) ==="
RESP=$(curl -sf -X POST "$GATEWAY_URL/gateway/notes" -H "Content-Type: application/json" \
  -d "{\"patient_no\":\"$PATIENT_NO\",\"care_unit\":\"$CARE_UNIT\",\"text\":\"B7 CI: skriven i legacy.\",\"author_sign\":\"BSEV\"}")
echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['direction']=='LEGACY_ONLY', d; assert d['shadow'] is None, d" \
  || fail "S0-skrivningen såg inte ut som väntat: $RESP"

echo "=== 6/9 — växla till NIMLOTH ==="
curl -sf -X PUT "$GATEWAY_URL/routing/$DOMAIN/$CARE_UNIT" -H "Content-Type: application/json" \
  -d '{"direction":"NIMLOTH","updated_by":"b7-ci"}' >/dev/null
DIR=$(curl -sf "$GATEWAY_URL/routing/$DOMAIN/$CARE_UNIT" | python3 -c "import json,sys; print(json.load(sys.stdin)['direction'])")
[[ "$DIR" == "NIMLOTH" ]] || fail "växlingen till NIMLOTH tog inte, läste tillbaka: $DIR"

echo "=== 7/9 — skriv i Nimloth, verifiera skuggning ==="
RESP=$(curl -sf -X POST "$GATEWAY_URL/gateway/notes" -H "Content-Type: application/json" \
  -d "{\"patient_no\":\"$PATIENT_NO\",\"care_unit\":\"$CARE_UNIT\",\"text\":\"B7 CI: skriven i Nimloth.\",\"author_sign\":\"BSEV\"}")
echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['direction']=='NIMLOTH', d; assert d['reverseShadow']['status']=='SUCCESS', d" \
  || fail "S2-skrivningen (Nimloth-auktoritativ) misslyckades eller skuggades inte: $RESP"

echo "=== 8/9 — växla tillbaka till LEGACY_ONLY (S3) ==="
curl -sf -X PUT "$GATEWAY_URL/routing/$DOMAIN/$CARE_UNIT" -H "Content-Type: application/json" \
  -d '{"direction":"LEGACY_ONLY","updated_by":"b7-ci"}' >/dev/null
DIR=$(curl -sf "$GATEWAY_URL/routing/$DOMAIN/$CARE_UNIT" | python3 -c "import json,sys; print(json.load(sys.stdin)['direction'])")
[[ "$DIR" == "LEGACY_ONLY" ]] || fail "återgången till LEGACY_ONLY tog inte, läste tillbaka: $DIR"

run_diff() {
  GATEWAY_PGHOST=localhost GATEWAY_PGPORT=15432 GATEWAY_PGDATABASE=core GATEWAY_PGUSER=core GATEWAY_PGPASSWORD=core \
    LEGACY_SIM_BASE_URL="$LEGACY_URL" EHRBASE_BASE_URL="$EHRBASE_URL" \
    pnpm --filter @nimloth-core/fhir-facade exec tsx src/parity/scripts/run-anteckning-diff.ts "$PATIENT_NO" "$EHR_ID"
}

echo "=== 9/10 — paritetsdiff åt båda håll, exportpaket, självbärandetest ==="
DIFF_OUT=$(run_diff)
echo "$DIFF_OUT"
echo "$DIFF_OUT" | grep -qE "MISMATCH: [1-9]" && fail "paritetsdiffen visade en avvikelse — se utskriften ovan"
echo "paritetsdiff: 0 avvikelser i båda riktningar"

echo "# B7 CI-placeholder — ersätter nimloth-docs/Forlustliggare_Anteckning_2026-08-19.md, som inte checkas ut i denna repo." \
  > /tmp/ci-loss-ledger.md
rm -rf /tmp/b7-export-output
GATEWAY_PGHOST=localhost GATEWAY_PGPORT=15432 GATEWAY_PGDATABASE=core GATEWAY_PGUSER=core GATEWAY_PGPASSWORD=core \
  LEGACY_SIM_BASE_URL="$LEGACY_URL" EHRBASE_BASE_URL="$EHRBASE_URL" LOSS_LEDGER_PATH=/tmp/ci-loss-ledger.md \
  pnpm --filter @nimloth-core/migration-gateway exec tsx src/scripts/generate-export-package.ts "$EHR_ID" /tmp/b7-export-output

ITEM_COUNT=$(python3 -c "import json; print(json.load(open('/tmp/b7-export-output/manifest.json'))['itemCount'])")
[[ "$ITEM_COUNT" == "1" ]] || fail "exportpaketet hade $ITEM_COUNT poster, förväntade 1"

# Självbärandetest — S4-grinden: kräver INGA tjänster uppe. Bevisas här
# genom att det görs mot filsystemet, oavsett att tjänsterna råkar vara
# uppe just nu (samma skript som Moria/lokalt, ingen CI-specialversion).
pnpm --filter @nimloth-core/migration-gateway exec tsx src/scripts/verify-export-package.ts /tmp/b7-export-output \
  || fail "självbärandetestet misslyckades"

echo "=== 10/10 — negativ kontroll: korrumpera på riktigt, bevisa att klassificeraren fäller ==="
ORIGINAL_TEXT="B7 CI: skriven i Nimloth."
LEGACY_NOTE_ID=$(docker compose -f "$COMPOSE_FILE" exec -T core-db \
  psql -U core -d core -tAc "SELECT legacy_note_id FROM reverse_shadow_write_log WHERE ehr_id='$EHR_ID' AND status='SUCCESS' LIMIT 1;" | tr -d '\r')
[[ -n "$LEGACY_NOTE_ID" ]] || fail "hittade ingen reverse-skuggad post att korrumpera"
echo "korrumperar legacy-raden $LEGACY_NOTE_ID (reversering registrerad innan körning, S10)"

docker compose -f "$COMPOSE_FILE" exec -T legacy-sim-db \
  psql -U legacy_sim -d legacy_sim -c "UPDATE notes SET text = '[B7 CI — AVSIKTLIG KORRUPTION, NEGATIV KONTROLL]' WHERE id = '$LEGACY_NOTE_ID';" >/dev/null

DIFF_OUT=$(run_diff)
echo "$DIFF_OUT" | grep -qE "REVERSE_SHADOW_SUCCESS_MISMATCH: 1" \
  || fail "negativ kontroll misslyckades: klassificeraren fällde INTE på en känd, avsiktlig avvikelse — se utskriften: $DIFF_OUT"
echo "negativ kontroll bevisad: REVERSE_SHADOW_SUCCESS_MISMATCH: 1 fyrade mot den korrumperade posten"

docker compose -f "$COMPOSE_FILE" exec -T legacy-sim-db \
  psql -U legacy_sim -d legacy_sim -c "UPDATE notes SET text = '$ORIGINAL_TEXT' WHERE id = '$LEGACY_NOTE_ID';" >/dev/null

DIFF_OUT=$(run_diff)
echo "$DIFF_OUT" | grep -qE "MISMATCH: [1-9]" && fail "reverseringen misslyckades: fortfarande en avvikelse efter återställning: $DIFF_OUT"
echo "reversering bekräftad: 0 avvikelser igen efter återställning"

echo
echo "=== B4-KEDJAN REST FRÅN NOLL: GRÖN (positiv OCH negativ kontroll bevisade) ==="

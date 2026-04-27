#!/usr/bin/env bash
# Fru Andersson-demo — går igenom hela Nimloth Core:s E2E-flöde via HTTP.
# Kräver att ./scripts/start.sh kört och tjänsterna är healthy.

set -euo pipefail
cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

# Läs portar som start.sh skrev när override.yml var aktiv (default: ren stack
# på 3003/3004/3005/3009; med override: 8003/8004/8005/8009).
if [ -f .start-env ]; then
  # shellcheck disable=SC1091
  source .start-env
fi

FHIR="${FHIR_BASE:-http://localhost:3003/fhir/r4}"
CDS="${CDS_BASE:-http://localhost:3004}"
AUDIT="${AUDIT_BASE:-http://localhost:3005}"
MAPPING="${MAPPING_BASE:-http://localhost:3009}"
DASHBOARD="${DASHBOARD_URL:-http://localhost:3010}"
PNR="19500315-2384"

if ! command -v jq >/dev/null 2>&1; then
  echo "FEL: demo-scriptet kräver jq."
  exit 1
fi

HEADERS=(-H "X-User-HSA: SE-DEMO-PHYSICIAN" -H "X-User-Role: PHYSICIAN" -H "X-PDL-Care-Relation: true" -H "X-PDL-Purpose: CARE" -H "X-PDL-Care-Unit: SE2321000131-E000000000001")

echo -e "${BOLD}${CYAN}🏥 Nimloth Core — Fru Andersson-demo${NC}"
echo -e "${CYAN}=====================================${NC}"
echo ""

# ------------------------------------------------------------
echo -e "${GREEN}▶ Steg 1: Sök patient via FHIR${NC}"
echo "  GET ${FHIR}/Patient?identifier=${PNR}"
PATIENT=$(curl -sS "${HEADERS[@]}" "${FHIR}/Patient?identifier=${PNR}")
NAME=$(echo "$PATIENT" | jq -r '.entry[0].resource.name[0].text // "okänd"')
AGE=$(echo "$PATIENT" | jq -r '.entry[0].resource.birthDate // "—"')
GENDER=$(echo "$PATIENT" | jq -r '.entry[0].resource.gender // "—"')
echo -e "  ✓ ${BOLD}${NAME}${NC} — född ${AGE}, ${GENDER}"
echo ""

# ------------------------------------------------------------
echo -e "${GREEN}▶ Steg 2: \$everything (Bundle med ALLA resurser)${NC}"
echo "  GET ${FHIR}/Patient/${PNR}/\$everything"
EVERY=$(curl -sS "${HEADERS[@]}" "${FHIR}/Patient/${PNR}/\$everything")
TOTAL=$(echo "$EVERY" | jq '.total')
echo -e "  ✓ Bundle innehåller ${BOLD}${TOTAL}${NC} resurser:"
echo "$EVERY" | jq -r '[.entry[].resource.resourceType] | group_by(.) | map("    \(.[0]): \(length)") | .[]'
echo ""

# ------------------------------------------------------------
echo -e "${GREEN}▶ Steg 3: Procedure (höftprotes + implantat)${NC}"
echo "$EVERY" | jq -r '
  .entry[] | select(.resource.resourceType=="Procedure") |
  .resource | (.code.text // "—") as $name |
  (.bodySite[0].coding[0].display // "—") as $side |
  (.extension[0].extension // []) as $impl |
  "  ✓ \($name) — \($side) sida",
  (if ($impl | length) > 0 then (
    "    Implantat:",
    ($impl[] | "      · \(.url): \(.valueString)")
  ) else empty end)
'
echo ""

# ------------------------------------------------------------
echo -e "${GREEN}▶ Steg 4: MedicationStatement (aktiva läkemedel)${NC}"
echo "  GET ${FHIR}/MedicationStatement?patient=${PNR}&status=active"
MEDS=$(curl -sS "${HEADERS[@]}" "${FHIR}/MedicationStatement?patient=${PNR}&status=active")
echo "$MEDS" | jq -r '.entry[]?.resource |
  (.medicationCodeableConcept.text // .medicationCodeableConcept.coding[0].display // "—") as $drug |
  (.medicationCodeableConcept.coding[0].code // "—") as $atc |
  "  · \($drug) [ATC \($atc)]"' | head -10
echo ""

# ------------------------------------------------------------
echo -e "${GREEN}▶ Steg 5: CDS Hooks (kliniskt beslutsstöd)${NC}"
echo "  POST ${CDS}/cds-services/core-patient-alerts"
CDS_BODY=$(jq -n --arg p "$PNR" '{
  hookInstance: "demo-001",
  hook: "patient-view",
  context: { userId: "Practitioner/SE-DEMO-PHYSICIAN", patientId: ("Patient/" + $p) }
}')
CARDS=$(curl -sS -X POST "${CDS}/cds-services/core-patient-alerts" -H "Content-Type: application/json" -d "$CDS_BODY")
CARD_COUNT=$(echo "$CARDS" | jq '.cards | length')
echo -e "  ✓ ${BOLD}${CARD_COUNT} kort${NC} returnerade:"
echo "$CARDS" | jq -r '.cards[] |
  "    [\(.indicator | ascii_upcase)] \(.summary)"'
echo ""

# ------------------------------------------------------------
echo -e "${GREEN}▶ Steg 6: Audit trail (PDL-kompatibel logg)${NC}"
sleep 2
echo "  GET ${AUDIT}/audit/search?patient=${PNR}"
AUDIT_RESP=$(curl -sS "${AUDIT}/audit/search?patient=${PNR}&limit=5")
AUDIT_TOTAL=$(echo "$AUDIT_RESP" | jq '.total')
echo -e "  ✓ ${BOLD}${AUDIT_TOTAL}${NC} senaste audit-poster:"
echo "$AUDIT_RESP" | jq -r '.results[] |
  "    \(.timestamp[0:19])  \(.action)  \(.resource_type)  [\(.outcome)]"'
echo ""

# ------------------------------------------------------------
echo -e "${GREEN}▶ Steg 7: Mapping-assistant (AI-assisterad integration)${NC}"
if curl -sS -f "${MAPPING}/health" >/dev/null 2>&1; then
  STATUS=$(curl -sS "${MAPPING}/system-status")
  PROMPTS_PASSED=$(echo "$STATUS" | jq -r '.prompts.passed')
  PROMPTS_FAILED=$(echo "$STATUS" | jq -r '.prompts.failed')
  PROVIDERS=$(echo "$STATUS" | jq -r '[.router.providers[] | select(.enabled) | .id] | join(", ")')
  echo -e "  ✓ Prompt-manifest verifierat (${PROMPTS_PASSED} pass, ${PROMPTS_FAILED} fail)"
  echo -e "  ✓ Aktiva LLM-providers: ${BOLD}${PROVIDERS}${NC}"

  echo -e "  ${YELLOW}→${NC} POST /propose (mock-LLM föreslår mapper för ny tabell)"
  PROPOSE_BODY=$(jq -n '{
    source: "demo.flexlab.results",
    target: "core.clinical.lab.result",
    schema: [
      {column: "patient_id", type: "integer"},
      {column: "order_type", type: "text"},
      {column: "result_value", type: "numeric"}
    ],
    samples: [{patient_id: 1, order_type: "STD", result_value: 42}]
  }')
  PROPOSAL=$(curl -sS -X POST "${MAPPING}/propose" -H "Content-Type: application/json" -d "$PROPOSE_BODY")
  PROPOSAL_ID=$(echo "$PROPOSAL" | jq -r '.id')
  PROVIDER=$(echo "$PROPOSAL" | jq -r '.provider_id')
  RESIDENCY=$(echo "$PROPOSAL" | jq -r '.data_residency')
  PROMPT_HASH=$(echo "$PROPOSAL" | jq -r '.prompt_hash[:16]')
  PROPOSED_PATH=$(echo "$PROPOSAL" | jq -r '.proposed_path // "—"')
  echo -e "  ✓ Suggestion ${BOLD}${PROPOSAL_ID}${NC} skapat via ${PROVIDER} (${RESIDENCY})"
  echo -e "    prompt-hash: ${PROMPT_HASH}…"
  echo -e "    skriven till: ${PROPOSED_PATH}"

  echo -e "  ${YELLOW}→${NC} POST /suggestions/${PROPOSAL_ID}/approve (mänsklig granskning)"
  APPROVE_BODY=$(jq -n '{
    approver_hsa_id: "SE-DEMO-INTEGRATION-ADMIN",
    approver_role: "integration-admin",
    reason: "demo: granskat och godkänt i Fru Andersson-flöde"
  }')
  APPROVED=$(curl -sS -X POST "${MAPPING}/suggestions/${PROPOSAL_ID}/approve" -H "Content-Type: application/json" -d "$APPROVE_BODY")
  STATUS_AFTER=$(echo "$APPROVED" | jq -r '.status')
  echo -e "  ✓ Status: ${BOLD}${STATUS_AFTER}${NC}"
  echo -e "    Audit-event publicerat till core.audit.mapping (eller bufrat om Kafka är nere)"
else
  echo -e "  ${YELLOW}⚠${NC}  mapping-assistant ej tillgänglig på ${MAPPING} — hoppar över steget"
fi
echo ""

echo -e "${CYAN}=====================================${NC}"
echo -e "${GREEN}${BOLD}✅ Demo slutförd${NC}"
echo -e "   Öppna dashboarden: ${YELLOW}${DASHBOARD}${NC}"
echo -e "   Mappings-vy:       ${YELLOW}${DASHBOARD}/mappings${NC}"
echo ""

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

FHIR="${FHIR_BASE:-http://localhost:3003/fhir/r4}"
CDS="${CDS_BASE:-http://localhost:3004}"
AUDIT="${AUDIT_BASE:-http://localhost:3005}"
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

echo -e "${CYAN}=====================================${NC}"
echo -e "${GREEN}${BOLD}✅ Demo slutförd${NC}"
echo -e "   Öppna dashboarden: ${YELLOW}http://localhost:3010${NC}"
echo ""

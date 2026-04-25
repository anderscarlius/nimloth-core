#!/usr/bin/env bash
# Demo: Fru Andersson-akutscenariot med distribuerad arkitektur.
# Visar hur patientdata flödar via edge-nod → lokal FHIR-cache → CDS.

set -euo pipefail
cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

PNR="19500315-2384"

HEADERS=(
  -H "X-User-HSA: SE-DEMO-AKUT-LAKARE"
  -H "X-User-Role: PHYSICIAN"
  -H "X-PDL-Care-Relation: true"
  -H "X-PDL-Purpose: CARE"
  -H "X-PDL-Care-Unit: SE2321000131-E000000000001"
)

if ! command -v jq >/dev/null 2>&1; then
  echo "FEL: demoscriptet kräver jq."
  exit 1
fi

echo -e "${CYAN}🏥 Fru Andersson — Akutscenariot med distribuerad Nimloth Core${NC}"
echo -e "${CYAN}=========================================================${NC}"
echo ""

echo -e "${GREEN}Scenario:${NC} Fru Ingrid Andersson (pnr $PNR), 74 år,"
echo "anländer till akutmottagningen SU Östra efter ett fall."
echo ""
echo "Akutläkaren har tre kritiska frågor som måste besvaras inom sekunder:"
echo "  1. Vilka mediciner står hon på?"
echo "  2. Är hon antikoagulerad?"
echo "  3. Har hon några kända allergier?"
echo ""
echo -e "${YELLOW}Datakällor:${NC} Melior SU (ortopedi) + AsynjaVisph (Närhälsan)"
echo -e "${YELLOW}Accessväg:${NC} Edge-nod SU FHIR-cache (lokal, <10ms latens)"
echo ""

# =============================================================
# Steg 1 — patientuppslag
# =============================================================
echo -e "${GREEN}Steg 1:${NC} Akutläkaren slår upp patienten via edge-nodens lokala FHIR"
PATIENT=$(curl -sf "http://localhost:4003/fhir/r4/Patient?identifier=$PNR" "${HEADERS[@]}")
NAME=$(echo "$PATIENT" | jq -r '.entry[0].resource.name[0].text')
GENDER=$(echo "$PATIENT" | jq -r '.entry[0].resource.gender')
BIRTH=$(echo "$PATIENT" | jq -r '.entry[0].resource.birthDate')
echo "  Namn:         $NAME"
echo "  Kön/född:     $GENDER / $BIRTH"
echo ""

# =============================================================
# Steg 2 — $everything
# =============================================================
echo -e "${GREEN}Steg 2:${NC} \$everything — hela klinisk bild i en request"
EVERYTHING=$(curl -sf "http://localhost:4003/fhir/r4/Patient/$PNR/\$everything" "${HEADERS[@]}")
TOTAL=$(echo "$EVERYTHING" | jq '.entry | length')
echo "  Total resurser: $TOTAL"
echo "$EVERYTHING" | jq '[.entry[].resource.resourceType] | group_by(.) | map({type: .[0], count: length}) | .[]' \
  | jq -r '"    - \(.type): \(.count)"'
echo ""

# =============================================================
# Steg 3 — allergier
# =============================================================
echo -e "${GREEN}Steg 3:${NC} Allergier"
echo "$EVERYTHING" \
  | jq -r '.entry[] | select(.resource.resourceType=="AllergyIntolerance") | "  ⚠️  \(.resource.code.text // "—")"' \
  | head -5
echo ""

# =============================================================
# Steg 4 — mediciner
# =============================================================
echo -e "${GREEN}Steg 4:${NC} Aktiva läkemedel"
echo "$EVERYTHING" \
  | jq -r '.entry[] | select(.resource.resourceType=="MedicationStatement") | "  💊 \(.resource.medicationCodeableConcept.text // "—")"' \
  | head -8
echo ""

# =============================================================
# Steg 5 — procedurer (inkl. implantat)
# =============================================================
echo -e "${GREEN}Steg 5:${NC} Procedurer (inkl. implantatdata)"
echo "$EVERYTHING" \
  | jq -r '.entry[] | select(.resource.resourceType=="Procedure") | "  🦴 \(.resource.code.text // "—") (\(.resource.performedDateTime // "?")) — implantat: \(.resource.extension[0].valueString // "ingen")"' \
  | head -5
echo ""

# =============================================================
# Steg 6 — CDS
# =============================================================
echo -e "${GREEN}Steg 6:${NC} CDS Hooks — beslutsstöd (alla tre regler)"
for RULE in core-anticoagulation core-implant-alert core-dvt-risk; do
  RES=$(curl -sf -X POST "http://localhost:4004/cds-services/$RULE" \
    -H "Content-Type: application/json" \
    -d "{\"hookInstance\":\"demo\",\"hook\":\"patient-view\",\"context\":{\"userId\":\"Practitioner/1\",\"patientId\":\"Patient/$PNR\"}}")
  CARD_COUNT=$(echo "$RES" | jq '.cards | length')
  if [ "$CARD_COUNT" -gt 0 ]; then
    echo "  🧠 $RULE → $CARD_COUNT kort"
    echo "$RES" | jq -r '.cards[] | "     • [\(.indicator)] \(.summary)"'
  fi
done
echo ""

# =============================================================
# Steg 7 — meta
# =============================================================
echo -e "${GREEN}Steg 7:${NC} Var kommer svaret ifrån?"
EDGE_HEALTH=$(curl -sf http://localhost:4006/health)
echo "  Edge instance: $(echo "$EDGE_HEALTH" | jq -r '.instance_id')"
echo "  Mode:          $(echo "$EDGE_HEALTH" | jq -r '.mode')"
echo "  Hub connected: $(echo "$EDGE_HEALTH" | jq -r '.central_hub_connected')"
echo ""

echo -e "${CYAN}=========================================================${NC}"
echo -e "${GREEN}✅ Akutläkaren har fått hela klinisk bild inom sekunder,${NC}"
echo -e "${GREEN}   via lokal edge-cache — ingen central round-trip.${NC}"
echo ""

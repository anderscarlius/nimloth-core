#!/usr/bin/env bash
# Simulerar akutbesök för Fru Andersson: INSERT i Melior → CDC → transform →
# FHIR Facade materialisering → CDS-varningar.

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
PNR="19500315-2384"
HEADERS=(-H "X-User-HSA: SE-EMERGENCY-MD" -H "X-User-Role: PHYSICIAN" -H "X-PDL-Emergency-Access: true" -H "X-PDL-Purpose: EMERGENCY" -H "X-PDL-Care-Unit: SU-AKUT-OSTRA")

echo -e "${BOLD}${RED}🚨 Nimloth Core — Akutscenario (Fru Andersson)${NC}"
echo -e "${CYAN}==============================================${NC}"
echo ""

# ------------------------------------------------------------
echo -e "${GREEN}▶ Steg 1: Antal observationer FÖRE akutbesök${NC}"
BEFORE=$(curl -sS "${HEADERS[@]}" "${FHIR}/Observation?patient=${PNR}&category=vital-signs" | jq '.total')
echo "  Vitala-observationer: ${BEFORE}"
echo ""

# ------------------------------------------------------------
echo -e "${GREEN}▶ Steg 2: Skapa akutbesök direkt i Melior${NC}"
docker compose exec -T melior-db psql -U melior -d melior >/dev/null <<SQL
INSERT INTO encounters (patient_id, encounter_type, department_code, department_name,
  admitting_doctor_hsa, admitting_doctor_name, admission_date, status)
VALUES (
  (SELECT patient_id FROM patients WHERE personnummer='${PNR}'),
  'EMERGENCY', 'SU-AKUT-OSTRA', 'Akutmottagningen SU Östra',
  'SE-EMERGENCY-MD', 'Dr. Anna Akutsson', NOW(), 'ACTIVE'
);

INSERT INTO observations (patient_id, encounter_id, observation_type, value_numeric, value_numeric2, unit, recorded_by_hsa, recorded_at)
VALUES
  ((SELECT patient_id FROM patients WHERE personnummer='${PNR}'),
   (SELECT MAX(encounter_id) FROM encounters WHERE patient_id=(SELECT patient_id FROM patients WHERE personnummer='${PNR}')),
   'BLOOD_PRESSURE', 165, 95, 'mmHg', 'SE-EMERGENCY-MD', NOW()),
  ((SELECT patient_id FROM patients WHERE personnummer='${PNR}'),
   (SELECT MAX(encounter_id) FROM encounters WHERE patient_id=(SELECT patient_id FROM patients WHERE personnummer='${PNR}')),
   'HEART_RATE', 102, NULL, 'bpm', 'SE-EMERGENCY-MD', NOW()),
  ((SELECT patient_id FROM patients WHERE personnummer='${PNR}'),
   (SELECT MAX(encounter_id) FROM encounters WHERE patient_id=(SELECT patient_id FROM patients WHERE personnummer='${PNR}')),
   'TEMPERATURE', 37.8, NULL, '°C', 'SE-EMERGENCY-MD', NOW()),
  ((SELECT patient_id FROM patients WHERE personnummer='${PNR}'),
   (SELECT MAX(encounter_id) FROM encounters WHERE patient_id=(SELECT patient_id FROM patients WHERE personnummer='${PNR}')),
   'SPO2', 93, NULL, '%', 'SE-EMERGENCY-MD', NOW());

INSERT INTO lab_results (patient_id, encounter_id, analysis_code, analysis_name, value_numeric, unit,
  ordering_doctor_hsa, lab_system_code, sample_collected_at, result_available_at)
VALUES
  ((SELECT patient_id FROM patients WHERE personnummer='${PNR}'),
   (SELECT MAX(encounter_id) FROM encounters WHERE patient_id=(SELECT patient_id FROM patients WHERE personnummer='${PNR}')),
   'NPU04206', 'P-INR', 4.1, '', 'SE-EMERGENCY-MD', 'FLEXLAB-SU', NOW(), NOW()),
  ((SELECT patient_id FROM patients WHERE personnummer='${PNR}'),
   (SELECT MAX(encounter_id) FROM encounters WHERE patient_id=(SELECT patient_id FROM patients WHERE personnummer='${PNR}')),
   'NPU01685', 'Hemoglobin', 115, 'g/L', 'SE-EMERGENCY-MD', 'FLEXLAB-SU', NOW(), NOW());
SQL
echo "  ✓ 1 EMERGENCY encounter + 4 vitala + 2 lab insatta"
echo ""

# ------------------------------------------------------------
echo -e "${GREEN}▶ Steg 3: Väntar på CDC → transform → FHIR Facade (10 s)${NC}"
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  echo -n "."
done
echo ""
echo ""

# ------------------------------------------------------------
echo -e "${GREEN}▶ Steg 4: Verifiera att akutdata syns via FHIR${NC}"
AFTER=$(curl -sS "${HEADERS[@]}" "${FHIR}/Observation?patient=${PNR}&category=vital-signs" | jq '.total')
DIFF=$((AFTER - BEFORE))
echo "  Vitala-observationer: ${BEFORE} → ${AFTER} (${DIFF} nya)"
echo ""

# ------------------------------------------------------------
echo -e "${GREEN}▶ Steg 5: CDS Hooks med nödöppning${NC}"
CDS_BODY=$(jq -n --arg p "$PNR" '{
  hookInstance: "emergency-001",
  hook: "patient-view",
  context: { userId: "Practitioner/SE-EMERGENCY-MD", patientId: ("Patient/" + $p) }
}')
CARDS=$(curl -sS -X POST "${CDS}/cds-services/core-patient-alerts" -H "Content-Type: application/json" -d "$CDS_BODY")
echo "$CARDS" | jq -r '.cards[] |
  "    [\(.indicator | ascii_upcase)] \(.summary)"'
echo ""

# ------------------------------------------------------------
echo -e "${GREEN}▶ Steg 6: \$everything — inkluderar akutdata${NC}"
EVERY=$(curl -sS "${HEADERS[@]}" "${FHIR}/Patient/${PNR}/\$everything")
echo -e "  Total resurser: ${BOLD}$(echo "$EVERY" | jq '.total')${NC}"
echo "$EVERY" | jq -r '[.entry[].resource.resourceType] | group_by(.) | map("    \(.[0]): \(length)") | .[]'

echo ""
echo -e "${CYAN}==============================================${NC}"
echo -e "${GREEN}${BOLD}✅ Akutscenario klart — Fru Anderssons data synkad på ${DIFF} sekunder${NC}"
echo -e "${YELLOW}   Läkaren ser nu full historik + nya akutdata + CDS-varningar${NC}"
echo ""

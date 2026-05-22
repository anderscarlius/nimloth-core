#!/usr/bin/env bash
# build-medication-summary-opt.sh
#
# P3.0b Path C — fixture-pivot-pattern (Sprint 2.5 alt 3-bygge, 2026-05-03).
#
# Genererar medication_summary.v1.opt.xml genom string-transform av
# ehrbase-test-minimal-evaluation.opt-fixturen. Path C valdes över Path A
# (xmlbuilder2-baserad bridge) eftersom:
#   1. Sprint 2 etablerade fixture-pivot som accepterad pattern (P3.0)
#   2. Path A:s fixture-diff (P3.0b Del 1a.5) avslöjade att korrekt OPT
#      kräver COMPOSITION-omslutning kring EVALUATION — komplex att
#      generera generiskt utan beprövad mall
#   3. ehrbase-integration-tests har minimal_evaluation.opt som
#      strukturellt giltig EVALUATION-template — vi byter bara
#      template_id + archetype_id + concept
#
# Generisk ADL→XML-OPT-bridge skjuts till B12-kandidat.
#
# Användning:
#   ./infra/openehr/compiler/scripts/build-medication-summary-opt.sh
#
# Output: infra/openehr/templates/medication_summary.v1.opt.xml

set -euo pipefail

cd "$(dirname "$0")/../../../.."

SOURCE_FIXTURE="infra/openehr/test-fixtures/ehrbase-test-minimal-evaluation.opt"
OUTPUT="infra/openehr/templates/medication_summary.v1.opt.xml"

# Stabilt UID — EHRbase använder för version-tracking, måste vara konsistent
# mellan kompileringar. Genererat 2026-05-03 från randomUUID(); ändra inte.
TEMPLATE_UID="8a5e9c3b-7f12-4d6a-9e8f-3c4b1a2d5e6f"

if [ ! -f "$SOURCE_FIXTURE" ]; then
  echo "ERROR: Saknad källfixtur: $SOURCE_FIXTURE" >&2
  echo "Hämta från ehrbase-integration-tests per infra/openehr/test-fixtures/PROVENANCE.md" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"

# String-ersättningar:
#   - UID byts till stabilt medication_summary-UID (säkrar version-tracking)
#   - template_id: minimal_evaluation.en.v1 → medication_summary.v1
#   - concept-text: "Minimal evaluation" → "Medication summary"
#   - archetype_id: openEHR-EHR-EVALUATION.minimal.v1 →
#                   openEHR-EHR-EVALUATION.medication_summary.v1
sed \
  -e "s|<value>711d7d49-b3c6-4a6a-a6b4-a4bd02fc353d</value>|<value>${TEMPLATE_UID}</value>|" \
  -e "s|<value>minimal_evaluation.en.v1</value>|<value>medication_summary.v1</value>|" \
  -e "s|<concept>Minimal evaluation</concept>|<concept>Medication summary</concept>|" \
  -e "s|openEHR-EHR-EVALUATION.minimal.v1|openEHR-EHR-EVALUATION.medication_summary.v1|g" \
  "$SOURCE_FIXTURE" > "$OUTPUT"

echo "Genererat: $OUTPUT"
echo "Storlek: $(wc -l < "$OUTPUT") rader"
echo "SHA256: $(shasum -a 256 "$OUTPUT" | awk '{print $1}')"
echo ""
echo "Ladda mot EHRbase:"
echo "  curl -X POST -H 'Content-Type: application/xml' \\"
echo "    --data-binary @$OUTPUT \\"
echo "    http://localhost:18088/ehrbase/rest/openehr/v1/definition/template/adl1.4"

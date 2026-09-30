#!/usr/bin/env bash
# Runs SUSHI on the committable IG stub and asserts StructureDefinition output.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IG="${ROOT}/ig"

cd "${IG}"

SUSHI="${ROOT}/node_modules/.bin/sushi"
if [[ ! -x "${SUSHI}" ]]; then
  echo "Run npm install in ${ROOT} first"
  exit 1
fi

"${SUSHI}"

sd_count="$(find fsh-generated/resources -maxdepth 1 -name 'StructureDefinition-*.json' 2>/dev/null | wc -l | tr -d ' ')"
if [[ "${sd_count}" -lt 1 ]]; then
  echo "Expected at least one StructureDefinition in fsh-generated/resources/, found ${sd_count}"
  exit 1
fi

if ! grep -rl 'nimloth-stub-patient' fsh-generated/resources/StructureDefinition-*.json >/dev/null 2>&1; then
  echo "StructureDefinition for nimloth-stub-patient not found in generated output"
  exit 1
fi

echo "SUSHI green: ${sd_count} StructureDefinition file(s), including nimloth-stub-patient"

#!/usr/bin/env bash
# WP-FHIR1 — hermetisk smoke (Vitest). Live stack: se dual-store E2E + demo-fru-andersson.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "▶ WP-FHIR1 smoke: build + test fhir-facade"
pnpm --filter "@nimloth-core/fhir-facade..." build
pnpm --filter "@nimloth-core/fhir-facade" test

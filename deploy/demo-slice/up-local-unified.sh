#!/usr/bin/env bash
# WP-DEMO1 — reser lokal unified demo-stack + kör hälsa + AQL↔FHIR-bevis.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export AUTH_MODE="${AUTH_MODE:-dev}"
export CANONICAL_STORE="${CANONICAL_STORE:-both}"

echo "=== WP-DEMO1: startar unified stack (scripts/start.sh) ==="
./scripts/start.sh

echo ""
echo "=== WP-DEMO1: stack health ==="
bash "$ROOT/deploy/demo-slice/run-stack-health-check.sh"

echo ""
echo "=== WP-DEMO1: AQL ↔ FHIR bevis ==="
bash "$ROOT/deploy/demo-slice/run-aql-fhir-vitals-proof.sh"

echo ""
echo "=== WP-DEMO1: klar ==="
echo "  Dashboard:  ${DASHBOARD_URL:-http://localhost:3010}"
echo "  FHIR:       ${FHIR_BASE:-http://localhost:3003/fhir/r4}"
echo "  Fru-demo:   ./scripts/demo-fru-andersson.sh"
echo "  CIO-manus:  docs/operations/WP-DEMO1_CIO_Demo_Manus.md"

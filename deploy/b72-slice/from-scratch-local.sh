#!/usr/bin/env bash
# WP-B72 — reser minimal hel stack från noll (lokal build-väg) + spine health.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export AUTH_MODE="${AUTH_MODE:-dev}"
export CANONICAL_STORE="${CANONICAL_STORE:-both}"

echo "=== WP-B72: startar Tier A spine (scripts/start.sh) ==="
./scripts/start.sh

echo ""
echo "=== WP-B72: spine health ==="
bash "$ROOT/deploy/b72-slice/smoke-b72-health.sh"

if [[ "${B72_RUN_AQL_FHIR_PROOF:-0}" == "1" ]]; then
  echo ""
  echo "=== WP-B72: AQL ↔ FHIR bevis (valfritt) ==="
  bash "$ROOT/deploy/demo-slice/run-aql-fhir-vitals-proof.sh"
fi

echo ""
echo "=== WP-B72: klar (lokal) ==="
echo "  Tier B (domain-events): docker compose --profile domain-events up -d …"
echo "  AQL↔FHIR:               B72_RUN_AQL_FHIR_PROOF=1 $0"
echo "  Runbook:                deploy/b72-slice/RUNBOOK.md"
echo "  Eldar EHRbase:          deploy/core-slice/deploy-ehrbase-eldar.sh (kräver Anders-ja live)"

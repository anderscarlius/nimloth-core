#!/usr/bin/env bash
# WP-B72 — spine healthy: EHRbase + CDC event-path + FHIR (Tier A).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [ -f "$ROOT/.start-env" ]; then
  # shellcheck disable=SC1091
  source "$ROOT/.start-env"
fi

exec bash "$ROOT/deploy/demo-slice/run-stack-health-check.sh"

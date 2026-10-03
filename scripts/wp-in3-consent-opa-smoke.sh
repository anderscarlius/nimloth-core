#!/usr/bin/env bash
# WP-IN3 — samtycke/spärr-stub + OPA parity (dataklass 0).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== WP-IN3: build pdl-policy (workspace import) ==="
pnpm --filter '@nimloth-core/pdl-policy' build

echo "=== WP-IN3: pdl-policy unit tests ==="
pnpm --filter '@nimloth-core/pdl-policy' test

echo "=== WP-IN3: consent stub tests ==="
pnpm --filter '@nimloth-core/consent' test

echo "=== WP-IN3: fhir-facade WP-IN3 + PDL preservation ==="
pnpm --filter '@nimloth-core/fhir-facade' test -- src/__tests__/wp-in3-consent-opa.test.ts src/__tests__/pdl-preservation.test.ts

if command -v docker >/dev/null 2>&1; then
  echo "=== WP-IN3: OPA Rego tests (container) ==="
  docker run --rm -v "$ROOT/infra/opa/policies:/policies:ro" \
    openpolicyagent/opa:0.68.0 test -v /policies
else
  echo "=== WP-IN3: skip OPA container (docker not available) ==="
fi

echo "WP_IN3_OK=1"
echo "=== WP-IN3 CONSENT/OPA SMOKE GRÖN ==="

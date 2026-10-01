#!/usr/bin/env bash
# WP-CDS1 — hermetisk smoke (Vitest). Live stack: test/e2e.test.ts + demo-fru-andersson.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "▶ WP-CDS1 smoke: build + test cds-hooks"
pnpm --filter "@nimloth-core/cds-hooks..." build
pnpm --filter "@nimloth-core/cds-hooks" test

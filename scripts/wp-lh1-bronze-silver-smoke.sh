#!/usr/bin/env bash
# WP-LH1 — Bronze→Silver smoke (offline + unit tests). Dataklass 0.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== WP-LH1: lakehouse-pipeline unit tests ==="
pnpm --filter @nimloth-core/lakehouse-pipeline test

echo "=== WP-LH1: offline bronze→silver smoke ==="
pnpm --filter @nimloth-core/lakehouse-pipeline offline-smoke | tee /tmp/wp-lh1-smoke.log
grep -q 'WP_LH1_OK=1' /tmp/wp-lh1-smoke.log

echo "=== WP-LH1: lakehouse-stub contract tests ==="
pnpm --filter @nimloth-core/domain-event-lakehouse-stub test

echo "=== WP-LH1 BRONZE→SILVER SMOKE GRÖN ==="

#!/usr/bin/env bash
set -euo pipefail

# Snabb röktest mot EHRbase på Eldar (localhost efter deploy).
# 1) GET /ehrbase/ (health)
# 2) POST syntetisk OPT från test-fixtures (minimal action)

EHRBASE_HOST_PORT="${EHRBASE_HOST_PORT:-18124}"
BASE_URL="http://127.0.0.1:${EHRBASE_HOST_PORT}"
EHRBASE_URL="${BASE_URL}/ehrbase"
TEMPLATE_API="${EHRBASE_URL}/rest/openehr/v1/definition/template/adl1.4"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEFAULT_OPT="${REPO_ROOT}/infra/openehr/test-fixtures/ehrbase-test-minimal-action.opt"
OPT_FILE="${OPT_FILE:-$DEFAULT_OPT}"

echo "=== smoke ehrbase-eldar @ ${EHRBASE_URL} ==="

echo -n "health (GET /ehrbase/)... "
if ! curl -sfS "${EHRBASE_URL}/" -o /dev/null; then
  echo "MISSLYCKADES"
  exit 1
fi
echo "OK"

if [[ ! -f "$OPT_FILE" ]]; then
  echo "VARNING: OPT-fixture saknas ($OPT_FILE) — hoppar över template-load."
  echo "Sätt OPT_FILE eller kör från nimloth-core-checkout med infra/openehr/test-fixtures/."
  exit 0
fi

echo -n "OPT load (POST adl1.4, synthetic fixture)... "
http_code=$(curl -sS -o /tmp/ehrbase-smoke-opt-response.txt -w '%{http_code}' \
  -X POST "$TEMPLATE_API" \
  -H 'Content-Type: application/xml' \
  --data-binary "@${OPT_FILE}")

case "$http_code" in
  200|201|204)
    echo "OK (HTTP $http_code)"
    ;;
  409)
    # Template redan laddad från tidigare smoke — acceptabelt.
    echo "OK (HTTP $http_code — redan laddad)"
    ;;
  *)
    echo "MISSLYCKADES (HTTP $http_code)"
    head -c 500 /tmp/ehrbase-smoke-opt-response.txt >&2 || true
    exit 1
    ;;
esac

echo "=== smoke klar ==="

#!/usr/bin/env bash
# Regression guard: known-bad FSH must make SUSHI exit non-zero (MF3 A3).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IG="${ROOT}/ig"
FIXTURE="${IG}/test-fixtures/broken-syntax.fsh"

if ! command -v npx >/dev/null 2>&1; then
  echo "npx not found"
  exit 1
fi

if [[ ! -x "${ROOT}/node_modules/.bin/sushi" ]]; then
  echo "Run npm install in ${ROOT} first"
  exit 1
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

cp "${IG}/sushi-config.yaml" "${tmpdir}/"
mkdir -p "${tmpdir}/input/fsh"
cp "${FIXTURE}" "${tmpdir}/input/fsh/broken-syntax.fsh"

set +e
( cd "${tmpdir}" && "${ROOT}/node_modules/.bin/sushi" ) 2>&1
sushi_exit=$?
set -e

if [[ ${sushi_exit} -eq 0 ]]; then
  echo "FAIL: SUSHI succeeded on intentionally invalid FSH — CI fail-case would not catch regressions"
  exit 1
fi

echo "SUSHI fail-case OK: invalid FSH rejected (exit ${sushi_exit})"

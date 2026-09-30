#!/usr/bin/env bash
# Check OPT path inventory against a committed baseline (Java OptPathInventory — single source of truth).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
COMPILER_DIR="${ROOT_DIR}/infra/openehr/compiler"

if [[ $# -ne 2 ]]; then
  echo "Usage: check-opt-path-baseline.sh <file.opt> <baseline.paths.txt>" >&2
  exit 2
fi

OPT_FILE="$1"
BASELINE="$2"

cd "${COMPILER_DIR}"
mvn -q -DskipTests package
CLASSPATH="target/classes:$(mvn -q dependency:build-classpath -Dmdep.outputFile=/tmp/nimloth-openehr-cp.txt && cat /tmp/nimloth-openehr-cp.txt)"
exec java -cp "${CLASSPATH}" se.nimloth.openehr.compiler.OptPathInventoryCli --check "${OPT_FILE}" "${BASELINE}"

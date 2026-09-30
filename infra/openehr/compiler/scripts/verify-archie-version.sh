#!/usr/bin/env bash
# Verifierar att en archie-artefakt finns publicerad på Maven Central.
#
# Använder repo1.maven.org (maven-metadata.xml + POM HEAD) — inte search.maven.org
# Solr, som är känt flakigt i GitHub Actions.
#
# Användning:
#   ./verify-archie-version.sh com.nedap.healthcare.archie archie-all
#   ./verify-archie-version.sh com.nedap.healthcare.archie archie-all 3.14.0
#
# Exit codes:
#   0 = OK (eller bara lista, ingen version specificerad)
#   1 = Maven Central kunde inte nås eller metadata saknas
#   2 = Specificerad version finns inte publicerad

set -euo pipefail

GROUP_ID="${1:-com.nedap.healthcare.archie}"
ARTIFACT_ID="${2:-}"
VERSION="${3:-}"

if [[ -z "$ARTIFACT_ID" ]]; then
  echo "Ange artifactId (t.ex. archie-all). Exempel:" >&2
  echo "  $0 com.nedap.healthcare.archie archie-all" >&2
  exit 1
fi

GROUP_PATH="${GROUP_ID//./\/}"
BASE_URL="https://repo1.maven.org/maven2/${GROUP_PATH}/${ARTIFACT_ID}"
METADATA_URL="${BASE_URL}/maven-metadata.xml"

if ! METADATA=$(curl -sfL --max-time 30 "$METADATA_URL"); then
  echo "FEL: Kunde inte hämta maven-metadata.xml från ${METADATA_URL}" >&2
  exit 1
fi

LATEST=$(printf '%s\n' "$METADATA" | sed -n 's:.*<latest>\([^<]*\)</latest>.*:\1:p' | head -1)
RELEASE=$(printf '%s\n' "$METADATA" | sed -n 's:.*<release>\([^<]*\)</release>.*:\1:p' | head -1)

echo "Artefakt groupId=${GROUP_ID}:${ARTIFACT_ID} (Maven Central repo1):"
echo "  latest: ${LATEST:-okänd}"
echo "  release: ${RELEASE:-okänd}"

version_exists_in_metadata() {
  local v="$1"
  printf '%s\n' "$METADATA" | grep -Fq "<version>${v}</version>"
}

version_pom_reachable() {
  local v="$1"
  local pom_url="${BASE_URL}/${v}/${ARTIFACT_ID}-${v}.pom"
  curl -sfL --max-time 30 -o /dev/null "$pom_url"
}

if [[ -n "$VERSION" ]]; then
  if version_exists_in_metadata "$VERSION" || version_pom_reachable "$VERSION"; then
    echo ""
    echo "OK: ${GROUP_ID}:${ARTIFACT_ID}:${VERSION} finns på Maven Central."
  else
    echo ""
    echo "FEL: version ${VERSION} hittades inte i metadata och POM är inte nåbar." >&2
    echo "  Kolla: https://central.sonatype.com/artifact/${GROUP_ID}/${ARTIFACT_ID}/${VERSION}" >&2
    exit 2
  fi
fi

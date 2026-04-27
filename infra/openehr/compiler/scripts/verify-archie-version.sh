#!/usr/bin/env bash
# Verifierar att en archie-artefakt finns publicerad på Maven Central.
#
# Användning:
#   ./verify-archie-version.sh                                   # Lista alla archie-artefakter
#   ./verify-archie-version.sh com.nedap.healthcare.archie tools 3.17.0  # Verifiera specifik
#
# Exit codes:
#   0 = OK (eller bara lista, ingen version specificerad)
#   1 = Maven Central kunde inte nås
#   2 = Specificerad version verifierades inte

set -euo pipefail

GROUP_ID="${1:-com.nedap.healthcare.archie}"
ARTIFACT_ID="${2:-}"
VERSION="${3:-}"

if [[ -z "$ARTIFACT_ID" ]]; then
  # Lista alla artefakter under gruppen
  QUERY_URL="https://search.maven.org/solrsearch/select?q=g:${GROUP_ID}&rows=50&wt=json"
else
  QUERY_URL="https://search.maven.org/solrsearch/select?q=g:${GROUP_ID}+AND+a:${ARTIFACT_ID}&rows=20&wt=json"
fi

if ! RESPONSE=$(curl -sfL --max-time 30 "$QUERY_URL"); then
  echo "FEL: Kunde inte nå Maven Central via $QUERY_URL" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "FEL: jq krävs men saknas i PATH" >&2
  exit 1
fi

echo "Artefakter under groupId=${GROUP_ID}${ARTIFACT_ID:+:$ARTIFACT_ID}:"
echo "$RESPONSE" | jq -r '.response.docs[] | "  \(.a) — latest: \(.latestVersion), published: \(.timestamp / 1000 | strftime("%Y-%m-%d"))"'

if [[ -n "$VERSION" ]]; then
  EXISTS=$(echo "$RESPONSE" | jq -r --arg v "$VERSION" '.response.docs[] | select(.latestVersion == $v) | .a' | head -1)
  if [[ -z "$EXISTS" ]]; then
    echo ""
    echo "VARNING: version ${VERSION} verifierades inte som senaste i sökningen." >&2
    echo "  Detta kan betyda att versionen finns men inte är senaste, eller att den inte finns." >&2
    echo "  Kolla manuellt: https://central.sonatype.com/artifact/${GROUP_ID}/${ARTIFACT_ID}/${VERSION}" >&2
    exit 2
  fi
  echo ""
  echo "OK: ${GROUP_ID}:${ARTIFACT_ID}:${VERSION} verifierad som senaste."
fi

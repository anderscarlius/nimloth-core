#!/usr/bin/env bash
set -euo pipefail

# fru-andersson-slice — Moria pull-deploy, multi-container (Block 8 steg 4,
# 2026-09-08). Körs PÅ Moria, mot en färsk scp:ad kopia av denna fil +
# docker-compose.moria.yml + de landade G4-artefakterna (init/, kafka/,
# debezium/, .env) — se
# nimloth-docs/NOW_Block8_FruAnderssonSlice_forberedelse.md §8 för
# scp-sekvensen. ALDRIG körd live — skrivet och granskningsbart, inte
# exekverat (S2, Block 8 steg 4-sessionen).
#
# Skiljer sig från services/cohort-service/deploy/deploy.sh och
# services/migration-gateway/deploy/moria/deploy.sh på tre sätt, alla
# verifierade eller motiverade i Fas 1 (samma session):
#
#   1. FEM IMAGE_TAG_*-variabler, inte en. Docker Compose interpolerar HELA
#      YAML-filen innan någon tjänst väljs ut — verifierat empiriskt
#      (docker compose config, lokalt, ingen up): `up -d fhir-facade`
#      failar om IMAGE_TAG_INGEST/TRANSFORM/CDS_HOOKS/AUDIT saknas, trots
#      att de tjänsterna inte alls efterfrågas. De fyra tjänsterna saknar
#      ghcr-workflow (aspirationella i compose-filen). Det här scriptet
#      sätter därför en explicit PLATSHÅLLARE åt dem enbart så Compose kan
#      parsa filen, och vägrar sedan någonsin STARTA dem — se `up`.
#
#   2. Eget nätverk (`core-slice`, driver: bridge, skapas av Compose) —
#      inget `docker network create` att göra idempotent, till skillnad
#      från migration-gateways delade `b4-chain` (external: true).
#
#   3. Eget tokenfile: /opt/nimloth-deploy-core-slice/.env — INTE
#      /opt/nimloth-deploy/.env (den mappen ägs av nsf-agent, 0700 — S4
#      förbjuder att röra den). Tokeninnehållet är olöst (G5 i runbooken,
#      Anders' beslut, inte det här scriptets). Scriptet läser filen om
#      den finns, felar tydligt med hänvisning till G5 om den inte gör det.
#
# Användning (på Moria, efter scp enligt runbook §8):
#
#   ./deploy.sh bootstrap
#   IMAGE_TAG_FHIR_FACADE=sha-abc1234 ./deploy.sh pull infra
#   IMAGE_TAG_FHIR_FACADE=sha-abc1234 ./deploy.sh up infra
#   IMAGE_TAG_FHIR_FACADE=sha-abc1234 ./deploy.sh pull fhir-facade
#   IMAGE_TAG_FHIR_FACADE=sha-abc1234 ./deploy.sh up fhir-facade
#   ./deploy.sh status
#   ./deploy.sh down
#   ./deploy.sh rollback <föregående-tagg>
#
# Rollback rör aldrig nätverk eller volymer (samma princip som
# migration-gateways deploy.sh) — bara image-taggen byts.

cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.moria.yml"
ENV_FILE="/opt/nimloth-deploy-core-slice/.env"
PLACEHOLDER_TAG="unbuilt-no-workflow-yet"

INFRA_SERVICES=(melior-db asynja-db core-db kafka kafka-connect)
FHIR_FACADE_SERVICES=(fhir-facade)

# ------------------------------------------------------------------
# Platshållare för de fyra apptjänster som saknar ghcr-workflow. Sätts
# ENDAST om anroparen inte redan exporterat ett riktigt värde (t.ex. en
# framtida session där ingest fått sin egen publish-workflow) — detta
# script startar dem ändå aldrig (se services_for_scope — bara 'infra'
# och 'fhir-facade' är giltiga scope), så platshållaren existerar bara
# för att Compose ska kunna parsa filen.
# ------------------------------------------------------------------
set_aspirational_placeholders() {
  : "${IMAGE_TAG_INGEST:=$PLACEHOLDER_TAG}"
  : "${IMAGE_TAG_TRANSFORM:=$PLACEHOLDER_TAG}"
  : "${IMAGE_TAG_CDS_HOOKS:=$PLACEHOLDER_TAG}"
  : "${IMAGE_TAG_AUDIT:=$PLACEHOLDER_TAG}"
  export IMAGE_TAG_INGEST IMAGE_TAG_TRANSFORM IMAGE_TAG_CDS_HOOKS IMAGE_TAG_AUDIT
}

# infra-scope behöver aldrig ett RIKTIGT fhir-facade-tag — sätt platshållare
# om anroparen inte redan har ett (t.ex. mitt i en full up-sekvens).
set_fhir_facade_placeholder_if_unset() {
  : "${IMAGE_TAG_FHIR_FACADE:=$PLACEHOLDER_TAG}"
  export IMAGE_TAG_FHIR_FACADE
}

# fhir-facade-scope kräver ett RIKTIGT tag — fail-closed, ingen platshållare.
require_real_fhir_facade_tag() {
  : "${IMAGE_TAG_FHIR_FACADE:?Sätt IMAGE_TAG_FHIR_FACADE, t.ex. sha-abc1234 — se .github/workflows/fhir-facade-publish.yml för hur taggen produceras. Ingen platshållare tillåten här, till skillnad från 'up infra'.}"
  export IMAGE_TAG_FHIR_FACADE
}

require_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "FEL: $ENV_FILE saknas." >&2
    echo "Denna slice delar INTE token med /opt/nimloth-deploy/ (S4, nsf-agent äger den mappen)." >&2
    echo "Tokenfrågan (kopiera moria-ghcr-pull-v2 vs ny PAT) är olöst — se G5 i" >&2
    echo "nimloth-docs/NOW_Block8_FruAnderssonSlice_forberedelse.md. Skapa filen manuellt innan deploy." >&2
    exit 1
  fi
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  : "${GHCR_USER:?GHCR_USER saknas i $ENV_FILE}"
  : "${GHCR_PAT:?GHCR_PAT saknas i $ENV_FILE}"
}

ghcr_login() {
  require_env_file
  echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
}

# Sätter den globala arrayn `services` — inte mapfile/process substitution
# (bash 4+), för att inte förutsätta en specifik bash-version på Moria.
services_for_scope() {
  case "$1" in
    infra) services=("${INFRA_SERVICES[@]}") ;;
    fhir-facade) services=("${FHIR_FACADE_SERVICES[@]}") ;;
    *)
      echo "FEL: okänt scope '$1'." >&2
      echo "Giltiga scope: infra, fhir-facade. 'all' eller liknande vägras avsiktligt —" >&2
      echo "4 av 5 apptjänster saknar ghcr-image (ingen workflow byggd än). Kör 'up infra'" >&2
      echo "för infrastrukturen, sedan 'up fhir-facade' för rök-testet." >&2
      exit 1
      ;;
  esac
}

cmd_bootstrap() {
  echo "=== fru-andersson-slice — bootstrap-validering (landade paths, inget körs) ==="
  local missing=0
  check() {
    local path="$1" hint="$2"
    if [[ -e "$path" ]]; then
      echo "  OK      $path"
    else
      echo "  SAKNAS  $path  ($hint)"
      missing=1
    fi
  }
  check "$COMPOSE_FILE" "scp:ad från deploy/core-slice/docker-compose.moria.yml"
  check "init/init-melior.sql" "scp:ad från infra/postgres/init-melior.sql"
  check "init/init-asynja.sql" "scp:ad från infra/postgres/init-asynja.sql"
  check "init/init-core.sql" "scp:ad från infra/postgres/init-core.sql"
  check "kafka/create-topics.sh" "scp:ad från infra/kafka/create-topics.sh"
  check "debezium/register-connectors.sh" "scp:ad från infra/debezium/register-connectors.sh"
  check "$ENV_FILE" "se G5 i NOW_Block8_FruAnderssonSlice_forberedelse.md — olöst, skapa manuellt"
  echo
  if [[ "$missing" -eq 1 ]]; then
    echo "FEL: en eller flera artefakter saknas. Se runbook §8 för scp-sekvensen." >&2
    exit 1
  fi
  echo "Alla landade artefakter finns. OBS: detta kör INTE create-topics.sh eller"
  echo "register-connectors.sh — de kräver att kafka-connect redan är healthy"
  echo "('up infra' först), och körs som separata, manuella steg enligt runbook §8."
}

cmd_pull() {
  local scope="${1:?Ange scope: pull infra|fhir-facade}"
  local -a services
  services_for_scope "$scope"
  set_aspirational_placeholders
  if [[ "$scope" == "infra" ]]; then
    set_fhir_facade_placeholder_if_unset
  else
    require_real_fhir_facade_tag
  fi
  ghcr_login
  docker compose -f "$COMPOSE_FILE" pull "${services[@]}"
}

cmd_up() {
  local scope="${1:?Ange scope: up infra|fhir-facade}"
  local -a services
  services_for_scope "$scope"
  set_aspirational_placeholders

  if [[ "$scope" == "infra" ]]; then
    set_fhir_facade_placeholder_if_unset
    ghcr_login
    echo "=== fru-andersson-slice: up infra (5 tjänster) ==="
    docker compose -f "$COMPOSE_FILE" up -d --wait --wait-timeout 90 "${services[@]}"
  else
    require_real_fhir_facade_tag
    ghcr_login
    PREVIOUS_IMAGE=$(docker inspect fhir-facade-slice --format '{{.Config.Image}}' 2>/dev/null || echo "(ingen körande container — första deploy)")
    echo "Föregående fhir-facade-image (rollback-referens): $PREVIOUS_IMAGE"
    echo
    echo "=== fru-andersson-slice: up fhir-facade (rök-test, IMAGE_TAG=$IMAGE_TAG_FHIR_FACADE) ==="
    docker compose -f "$COMPOSE_FILE" up -d --wait --wait-timeout 60 "${services[@]}"
  fi

  echo
  docker compose -f "$COMPOSE_FILE" ps "${services[@]}"
}

cmd_status() {
  set_aspirational_placeholders
  set_fhir_facade_placeholder_if_unset
  docker compose -f "$COMPOSE_FILE" ps
}

cmd_down() {
  set_aspirational_placeholders
  set_fhir_facade_placeholder_if_unset
  echo "=== fru-andersson-slice: down (nätverk/volymer rörs inte) ==="
  docker compose -f "$COMPOSE_FILE" down
}

cmd_rollback() {
  local tag="${1:?Ange föregående tagg: rollback sha-xxxxxxx (se 'Föregående fhir-facade-image' i tidigare up-körning)}"
  echo "=== fru-andersson-slice: rollback fhir-facade → $tag ==="
  IMAGE_TAG_FHIR_FACADE="$tag" cmd_up fhir-facade
}

usage() {
  cat >&2 <<'EOF'
Användning: ./deploy.sh <kommando> [scope|tagg]

  bootstrap                  Validera landade paths under denna mapp. Kör inget.
  pull <infra|fhir-facade>   docker compose pull, scopat.
  up <infra|fhir-facade>     docker compose up -d --wait, scopat. 'all' vägras.
  status                     docker compose ps (alla tjänster).
  down                       docker compose down (rör aldrig nätverk/volymer).
  rollback <tagg>            Kör om 'up fhir-facade' med angiven IMAGE_TAG_FHIR_FACADE.

Se nimloth-docs/NOW_Block8_FruAnderssonSlice_forberedelse.md för full runbook.
EOF
  exit 1
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    bootstrap) cmd_bootstrap ;;
    pull) shift; cmd_pull "$@" ;;
    up) shift; cmd_up "$@" ;;
    status) cmd_status ;;
    down) cmd_down ;;
    rollback) shift; cmd_rollback "$@" ;;
    *) usage ;;
  esac
}

main "$@"

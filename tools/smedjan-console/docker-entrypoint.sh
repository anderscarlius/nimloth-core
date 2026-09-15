#!/bin/sh
# Idempotent bootstrap: klona repot om volymen är tom, annars uppdatera det
# innan servern startar. nimloth-core är publikt sedan 2026-09-14, så
# själva klon-steget behöver ingen token -- bara push:ar (server/git.ts)
# gör det, per-kommando via en engångs http.extraheader, aldrig sparat här.
set -eu

: "${SMEDJAN_REPO_ROOT:?SMEDJAN_REPO_ROOT måste sättas}"
: "${SMEDJAN_GITHUB_REPO:=anderscarlius/nimloth-core}"
: "${SMEDJAN_BASE_BRANCH:=main}"

if [ ! -d "$SMEDJAN_REPO_ROOT/.git" ]; then
  echo "[entrypoint] Ingen klon hittad i $SMEDJAN_REPO_ROOT -- klonar https://github.com/$SMEDJAN_GITHUB_REPO.git ($SMEDJAN_BASE_BRANCH)"
  # Töm INNEHÅLLET, inte katalogen själv -- $SMEDJAN_REPO_ROOT är normalt
  # en monterad Docker-volym vars ägarskap på katalogen (till skillnad
  # från dess innehåll) inte alltid är skrivbart för nodeapp.
  find "$SMEDJAN_REPO_ROOT" -mindepth 1 -delete 2>/dev/null || true
  git clone --branch "$SMEDJAN_BASE_BRANCH" "https://github.com/$SMEDJAN_GITHUB_REPO.git" "$SMEDJAN_REPO_ROOT"
else
  echo "[entrypoint] Befintlig klon hittad i $SMEDJAN_REPO_ROOT -- uppdaterar"
  git -C "$SMEDJAN_REPO_ROOT" fetch origin "$SMEDJAN_BASE_BRANCH"
  git -C "$SMEDJAN_REPO_ROOT" checkout "$SMEDJAN_BASE_BRANCH"
  git -C "$SMEDJAN_REPO_ROOT" reset --hard "origin/$SMEDJAN_BASE_BRANCH"
fi

exec node dist-server/index.js

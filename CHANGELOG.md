# Changelog

Alla anmärkningsvärda ändringar dokumenteras här. Följer [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added — Levererade bevis efter Sprint 2 (utanför sprint-numreringen)

Dessa poster följer Nordstjärnans block-/bevisnumrering (se `nimloth-docs/Malbild_Nimloth_Nordstjarna_v0.1.md`), inte sprint-versionsnumreringen nedan. Se `docs/ROADMAP.md` §"Levererade bevis efter Sprint 2" för samma innehåll där. Sprint 3 (Inera) är fortsatt planerad, opåbörjad.

- **B4a** (2026-08-27, `migration-gateway`) — reversibel skrivväg-flytt från legacy till Nimloth och tillbaka (S0→S1→S2→S3), verifierat live, exportpaket självbärande och signaturverifierat. B4b (full återföring i legacyns egen tabell) är en distinkt, ej uppnådd nästa nivå.
- **B7 nivå 1** (2026-08-28–2026-08-29) — B4-kedjan rest från noll i CI (`verify-b4-chain-from-scratch`, positiv och negativ kontroll), deployad isolerad på dokumenterad Moria-värd (ej SSH-verifierad), exponerad via Cloudflare Access med namngiven e-postpolicy, verifierat visningsbar. B7 nivå 2 (hela 26-tjänstersstacken rest från noll) är obyggd.

Detaljer: `nimloth-docs/B7_CICD_och_Moria_2026-08-19.md`, `nimloth-docs/Malbild_Nimloth_Nordstjarna_v0.1.md`. (Rapportfilens datum i namnet är sessionens startdatum, inte genomförandedatumet — det senare står i rapportens egen header. Avsiktlig konvention, inte en avvikelse.)

## [0.1.0] - 2026-04-25

### Added
- Initial import från Nimloth Flow (tag `v0.1-pre-fork`)
- Nimloth Core-identitet etablerad: eget namespace, egen version-historik
- Dokumentation: README, POSITIONING, ROADMAP, CONTRIBUTING
- Utbyggnadsprompter P1–P7 i `docs/prompts/` (Sprint 1–5-arbetsstack)

### Notes
Denna release är baseline för Sprint 0. Sprint 1 (version 0.2.0) börjar när alla Sprint 0-deliverables är klara.

# CLAUDE.md — nimloth-core

Detta är Nimloth Core: en modulär, standardbaserad referensarkitektur för
svensk e-hälsa (openEHR internt, FHIR externt, Kafka i mitten, OMOP/
lakehouse för analys). Northfactor AB. Se `README.md`/`docs/ARCHITECTURE.md`
för den fulla bilden — det här dokumentet är bara det du behöver för att
börja jobba utan att fråga muntligt varje gång.

## Struktur

- `services/<namn>/` — en tjänst = en Smedjan-modul (godkänt 2026-09-14,
  se `backlog/stories/README.md`). Node/TypeScript, egen `package.json`.
- `packages/<namn>/` — delad grund (t.ex. `shared`, `model-router`,
  `kafka-utils`). INTE egna moduler — konsumeras av flera tjänster.
- `tools/<namn>/` — interna verktyg (t.ex. `smedjan-console`), inte
  produktkod.
- `infra/openehr/` — arketyper, kompilator, mallar. Se hotspot-varning
  nedan.
- `deploy/` — riktiga deploy-artefakter för Moria. Compose-FRAGMENT
  (`docker-compose.<namn>-slice.yml`) körs TILLSAMMANS med
  `docker-compose.moria.yml`, aldrig ensamma.

## Hur ett arbetsflöde ser ut (Smedjan)

```
intake/<datum>-<slug>/   → spec/<slug>.md   → backlog/stories/<slug>.md   → kod
```

Se `intake/README.md`, `spec/README.md`, `backlog/stories/README.md`.
`tools/smedjan-console` (lokalt: `pnpm --filter @nimloth-core/smedjan-console dev`,
port 3019) visar/skapar dessa. `.smedjan/agents.yaml` beskriver modellval
och risknivåer för autonomt arbete i detta repo.

## Git — PR krävs, branch protection är PÅ

Repot är **publikt** sedan 2026-09-14 (gitleaks-skannat, rent) med
branch protection på `main` (PR krävs för merge, force-push/deletion
avstängt). Direkt push till `main` är inte den normala vägen — skapa
branch, PR, merga (squash) efter grön CI. Använd
`.github/PULL_REQUEST_TEMPLATE.md`s komponentgrind som checklista, inte
bara som formalitet.

## Språk

Svenska för domän/dokumentation/commit-meddelanden (klinisk och
organisatorisk mening). Engelska för kod — variabel-/funktionsnamn,
kod-kommentarer som förklarar VARFÖR (inte VAD), typnamn.

## Testa

- Per tjänst: `pnpm --filter @nimloth-core/<namn> test` (Vitest).
- openEHR-kompilatorn: `pnpm openehr:compile` (kräver Docker), riktiga
  regressionstester i `infra/openehr/compiler/src/test/` — mönster att
  kopiera för nya kontraktstester (se `tests/contracts/README.md`).
- Innan du litar på en tjänst utan tester: `audit`, `dashboard`, `ingest`
  har idag **noll** testfiler — kända, dokumenterade luckor, inte
  bortglömda av misstag.

## Kända fällor (verifierade, inte gissade)

- **`openEHR Compiler`-CI:ts `verify-archie-version`-steg är känt
  flakigt** (Maven Central-nätverksfel från GitHub-hostade runners, inte
  ett kodfel). Kör om (`gh run rerun <id> --failed`) innan du misstänker
  din egen ändring.
- **`/opt/nimloth-core` på Moria är fryst legacy** (commit `88231b9`,
  2026-05-26, plus okommitterade handredigeringar aldrig fångade i git).
  Behandla den ALDRIG som sanningskälla för "vad som faktiskt körs" —
  se `nimloth-docs/discovery-nimloth-2026-09-14-1800.md` §4.5. Nya
  testdeployer görs som isolerade slices (`fru-andersson-slice`,
  `ehrbase-slice`-mönstret i `deploy/core-slice/`), aldrig genom att röra
  den frusna stacken.
- **EHRbase OPT-generering har flera icke uppenbara krav** (term-
  definitions för nästlade node-id:n OCH för kod-värden separat,
  `code_list` som repeterade platta element inte nästlade `<value>`,
  tomma `C_SINGLE_ATTRIBUTE` kraschar parsern) — alla dokumenterade med
  rotorsak i `infra/openehr/compiler/.../OperationalTemplateXmlBuilder.java`s
  Javadoc. Läs den innan du "fixar" ett OPT-genereringsfel genom att gissa.
- **Hemligheter**: `.env`/`.env.*.local` är gitignorat, `.env.example`
  är det som checkas in. Aldrig hårdkoda tokens/lösenord — Moria-
  hemligheter (GHCR, GitHub-tokens för `smedjan-console`) lever i
  `.env`-filer på Moria (`0600`), aldrig i git.

## Om du är osäker

Läs `nimloth-docs/discovery-nimloth-2026-09-14-1800.md` (fullständig,
verifierad revision av hela projektets tillstånd) innan du antar hur
något fungerar — flera saker som "borde" vara sanna enligt äldre
dokumentation visade sig inte stämma.

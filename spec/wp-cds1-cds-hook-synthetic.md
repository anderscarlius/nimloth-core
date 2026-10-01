# WP-CDS1 — CDS Hook syntetisk trigger (Fas D)

**Status:** implementerat i `services/cds-hooks`.  
**Dataklass:** 0 (syntetisk demo-data, ingen riktig patient).  
**Planreferens:** Plan_Bygg § D WP-CDS1.

## Syfte

Bevisa **CDS Hooks 2.0**-integration mot Nimloth Core: discovery, `patient-view`-hook
med syntetisk prefetch (eller FHIR Facade när stacken körs), samt visning av cards i
dashboard eller strukturerad logg.

## Nuläge (inventering)

| Yta | Plats | Not |
|-----|-------|-----|
| CDS-server | `services/cds-hooks` port 3004 | Express, CDS Hooks 2.0 |
| Discovery | `GET /cds-services` | Tre `patient-view`-services + alias `core-patient-alerts` |
| Hook | `POST /cds-services/core-patient-alerts` | Kombinerar antikoagulation, implantat, DVT-regler |
| Prefetch | Request-body eller `FhirClient` → `FHIR_BASE_URL` | WP-CDS1 smoke använder **endast** syntetisk prefetch |
| UI | `services/dashboard` `/patient/:pnr/cds` | `getCdsCards()` via Vite-proxy `/api/cds` |
| Logg | Pino `CDS hook processed` | `server.ts` efter varje hook |
| Förutsättning | WP-FHIR1 ✅ | SMART stub + FHIR Facade för live demo |

Regler är **deterministiska if/ATC/ICD** — inga ML-modeller, ingen Eldar/Moria-prod.

## Acceptans (Plan_Bygg D)

| # | Krav | Status |
|---|------|--------|
| 1 | CDS discovery + minst en hook (`patient-view`) med syntetisk patient | ✅ Vitest + fixture `synthetic-fru-andersson.ts` |
| 2 | Kort i UI **eller** logg | ✅ Dashboard CDS-sida + Pino info-logg |
| 3 | CI/smoke | ✅ `cds-hooks-smoke.yml` + `scripts/wp-cds1-smoke.sh` |
| 4 | Spec + kort AI Act-not | ✅ denna fil + `services/cds-hooks/docs/WP-CDS1-CDS-HOOK.md` |
| 5 | Dataklass 0 | ✅ endast syntetiskt personnummer `19500315-2384` i fixtures |

## AI Act (demo-scope)

Nimloth CDS Hooks i detta repo är **referens- och demonstrationskod** för
arkitektur (FHIR prefetch → regelbaserade cards). Den är **inte** avsedd som
medicinteknisk produkt, kliniskt beslutsstöd i produktion eller AI-system enligt
EU AI Act. Inga tränade modeller; inga rekommendationer till riktiga patienter utanför
kontrollerad demo.

## CI / kontraktsgrind

```bash
./scripts/wp-cds1-smoke.sh
```

Root `ci.yml` kör redan `@nimloth-core/cds-hooks` unit-tester; path-filtered workflow
 ovan kör full WP-CDS1-facit vid ändringar i cds-hooks.

## Medvetet OUT (denna WP)

- Produktions-CDS, CQL/Eldar live, ML-modeller
- `order-sign` i produktion (endast `patient-view` stub i denna leverans)
- Riktig patientdata i git eller CI

## Öppna frågor

- GHCR-publish för `cds-hooks` (aspiration i Moria compose) — separat deploy-story.
- `core-patient-alerts` i discovery-listan — alias idag; SMART-appar kan anropa POST direkt.

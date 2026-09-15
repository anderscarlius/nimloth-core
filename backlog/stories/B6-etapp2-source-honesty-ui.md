# Story: B6 Etapp 2 — lineage synlig i dashboard-UI

**Modul:** `dashboard`
**Spec:** ingen separat spec skrevs — se `nimloth-docs/KU_B6_Etapp2_Rapport.md`
§1 för spec-granskningen (gjord inline, eftersom den avslöjade att den
ursprungliga formuleringen byggde på fel antagande om arkitekturen).
**Status:** ✅ done (2026-09-15)
**Gate-nivå:** `low_risk` — UI-ändring i en redan fristående demo-vy
(`/compose-demo`), ingen skrivning mot delad state.

## Vad som faktiskt gjordes (avviker från ursprunglig formulering)

Ursprunglig formulering pekade på `omop.measurement._source`
(`live_transform`/`preloaded`). Investigationen visade att dashboarden
strukturellt aldrig läser OMOP — dess enda tidsseriedata kommer via AQL
direkt mot EHRbase, som inte kan returnera de "preloaded"-bulkraderna
över huvud taget. Den verkliga, jämförbara luckan: `observation_trend_
by_period`-mallen har returnerat `composition_uid` sedan KU Steg 2, men
dashboardens typ och komponent kastade tyst bort det.

**Fix:** `TrendPoint`-typen inkluderar nu `composition_uid`;
`ObservationTrend.tsx` visar det i en ny tooltip vid hover.

## Acceptans

Verifierat live mot Moria (`/compose-demo`, patient Ingrid Andersson):
tooltipen visar `8589a831-76df-48a4-b54a-e8e112c796fb::local.ehrbase.org::1`
— exakt samma komposition-UID som verifierades via SQL i B6 Etapp 1. Se
`nimloth-docs/KU_B6_Etapp2_Rapport.md` för fullständig verifiering
(build, live-webbläsartest, konsolfel-check).

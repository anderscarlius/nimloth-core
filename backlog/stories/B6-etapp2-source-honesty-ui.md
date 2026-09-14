# Story: B6 Etapp 2 — `_source`-ärlighet i dashboard-UI

**Modul:** `dashboard` (troligen även `fhir-facade` om `_source` behöver
exponeras via ett API dashboard läser från — inte verifierat än)
**Spec:** saknas ännu — detta är en QUEUED story, inte en godkänd en.
Kräver en riktig spec i `../../spec/` innan kodning börjar (se
`../../spec/README.md`).
**Status:** 🔵 open — inte påbörjad, inte godkänd för exekvering.
**Gate-nivå (preliminär):** sannolikt `low_risk` (UI-ändring, ingen
skrivning mot delad state) — bekräftas när specen skrivs.

## Bakgrund (från B6 Etapp 1:s öppna trådar)

`omop.measurement._source` (`live_transform` vs `preloaded`) existerar
redan i databasen och gör en verklig, viktig skillnad (4 rader med äkta
EHRbase→OMOP-lineage mot 114 314 bulk-genererade). **Oklart om detta syns
för en mänsklig granskare någonstans i dashboarden**, eller om det bara
lever i en databaskolumn ingen läser — vilket vore precis den typen av
"demo-ärlighet"-glapp Nordstjärnan varnar för.

## Vad en spec för detta skulle behöva svara på (inte svarat här)

1. Var i dashboarden är detta relevant — patientvy, mätvärdes-trend,
   någon administratörsyta?
2. Exponerar `fhir-facade` (eller vad dashboarden faktiskt läser ifrån)
   `_source` idag i sitt API-svar, eller behöver det läggas till där först?
3. Vad ska det se ut som — en badge, en tooltip, en filtreringsmöjlighet?

## Varför denna story inte bara kördes direkt

Anders bad specifikt om att scaffolda `intake/`→`spec/`→`backlog/stories/`
-flödet (2026-09-14) snarare än att köra Etapp 2 direkt. Denna story är
alltså ett konkret exempel på "något som väntar på en riktig spec-
granskning" i den nya strukturen, inte ett löfte om att den redan är
godkänd.

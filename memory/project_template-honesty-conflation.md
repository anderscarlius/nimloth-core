---
name: template-honesty-conflation
description: Compose-mallar måste vara sanna ensamma — kompositionens precedens får bara ordna presentation, aldrig avgöra korrekthet. Dropout-konflationsbuggen (Fas 2) som lärobok.
metadata:
  type: project
---

# Mall-ärlighet: precedens får inte maskera mis-klassificering

## Problemet (hittat Fas 2 Obs 1, fixat i PATCH dropout)

`se.nimloth.aql.diabetes_without_followup` (AQL-06), registrerad som **tier=honest**,
mis-klassificerade patienter. Den gamla logiken:

> dropout ⟺ ingen uppföljnings-HbA1c **ELLER** sista HbA1c **> N dygn** efter diagnos

Det ">N dygn"-villkoret fångade patienter som HADE uppföljning men sent:
- **Lars** (uppföljning dag 123, responder) → flaggad dropout
- **Eva** (uppföljning, non-responder) → flaggad dropout

Mallens namn och badge ("ingen uppföljning") **motsade vad den returnerade**. En
tier=honest-mall som ljuger om sitt eget namn är ett kontraktsbrott — den får inte
befordras till Compose-mall om en agent ska konsumera den i Fas 3.

## Hur det maskerades (det farliga)

Demo-komponenten (`ObservationTrend`) väljer badge via en **precedenskedja**:
responder → non-responder → dropout → ingen. Lars *returnerade* både `responder`
och `dropout`, men visades responder eftersom responder hade högre precedens.
**UI:t råkade vara rätt — av tur, inte av korrekthet.** Hade ordningen varit omvänd
hade Lars visats som dropout.

Buggen var bara synlig genom att **querya mallen rakt**, inte via badgen. Badge-
precedensen var en lögndetektor som tystade sig själv.

## Fixen

dropout ⟺ diabetes_typ2-diagnos **OCH noll** HbA1c efter diagnosens start_time.
Inget tidsfönster. `followup_window_days`-parametern borttagen (en parameter som
inget gör är vilseledande). Synkad i BÅDE `aql_queries.ts` (AQL-06, SDG-intern)
OCH den registrerade mallen. Resultat: AQL-06 78 → 11 rader (≈ 9 % av diabetiker
+ Anders-ankaret). Mallen bumpad v1.0.0 → v2.0.0.

Efter fixen: responder/non-responder/dropout är **ömsesidigt uteslutande av
konstruktion** (responder kräver uppföljnings-lab; dropout = ingen). Badge-
precedensen behövs inte längre för korrekthet — den är kvar som no-op-säkerhet.

## Den generella lärdomen (gäller all Compose-design)

**Varje mall måste vara sann ensam. Kompositionens konfliktupplösning (badge-
precedens, kort-ordning, z-index) får ENDAST ordna presentation — aldrig avgöra
om något är korrekt.** Om en mall bara är "rätt" därför att en annan mall råkar
visas ovanpå den, är den trasig.

Praktiska konsekvenser:
- **Querya mallar rakt, inte via UI:t**, när du verifierar korrekthet. UI-precedens
  döljer co-klassificering.
- **Namnet är ett kontrakt.** En mall som heter X måste returnera X. "Sen
  uppföljning" är inte "ingen uppföljning" — det är en annan fråga, en annan mall.
- **Ortogonalitet är målet.** Efter de-konflationen svarar `responder_after_rx` på
  en lab-fråga (sjönk värdet?) och `diabetes_without_followup` på en diagnos-fråga
  (finns uppföljning alls?). Ingrid visar det: responder=1 MEN no_diabetes_diagnosis
  (hennes diagnoser är koxartros/DVT, inte diabetes_typ2). Två ärliga svar på två
  olika frågor om samma patient — exakt den komponerbarhet Compose vill ha.

## Skyddet som finns

- **S4-validatorn** (registry.ts) gör INVARIANT 2 till kontrakt, men den fångar bara
  FLAT-prefix/composer.name-brott och tier — den fångar INTE semantisk mis-
  klassificering (namn vs logik). Den klassen måste fångas av direkt-query-
  verifiering, inte av validatorn.
- **tier-fältet** gatekeepar befordran till Fas 2-mallar (honest vs proxy).

## Öppet spår för Fas 3

`followup_days`-kolumnen togs bort helt (inte bara parametern) — den fanns bara för
fönster-logiken. Om Fas 3:s agent vill resonera om uppföljnings-*fördröjning* (inte
bara -frånvaro) byggs en EGEN mall: `time_to_followup`, tier=honest, returnerar
dagar utan att klassificera. Byggs när en konsument faktiskt frågar — inte spekulativt.

Relaterat: [[sdg-10-amendments]] (INVARIANT 1/2), [[sdg-fork-4-comorbidity]]
(tier-befordringsgräns).

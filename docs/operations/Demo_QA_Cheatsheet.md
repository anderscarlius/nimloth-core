# Demo Q&A Cheatsheet

**Syfte:** Snabba svar på fem mest sannolika frågor under demo eller efterföljande
diskussion. Korta — max ~3 meningar per svar. Djupare resonemang i
[`Human_Review_Demo_Talking_Points.md`](Human_Review_Demo_Talking_Points.md).

**Komplement:** [`Demo_Runbook.md`](Demo_Runbook.md) §3 inline talking-points
för fixture-stegen.

**Versionerat:** ja (i nimloth-core).

---

## Q1 — "Var hamnar patientdata?"

Tier-baserad sensitivity. `phi`-data går on-prem via hard-rule i model-router
och lämnar aldrig sjukvårdens infrastruktur. Demo-instansen kör `synthetic`-mode
mot cloud — det är därför vi kan visa den utanför infrastrukturen.

> Djupare svar: [`Human_Review_Demo_Talking_Points.md`](Human_Review_Demo_Talking_Points.md) §7 CIO-fråga produktion vs demo + [`Demo_Mode_Configuration.md`](Demo_Mode_Configuration.md).

---

## Q2 — "Vad händer om AI:n hallucinerar?"

Tre-case-distinktion i aggregator. Vid LLM-utlöst osäkerhet sätts status till
`human-review-required` med trigger `low_confidence`. Fixture 3 i demon
(`ambiguous-dosage.json`) visar exakt det fallet — systemet vägrar gissa.

> Djupare svar: [`Human_Review_Pathway_Design.md`](Human_Review_Pathway_Design.md) §2 Triggervillkor + §3 min-rule.

---

## Q3 — "Är ni GDPR/PDL-compliant?"

Tier-modellen + audit-pathway via outbox-pattern är compliant by design, inte
by policy. Komplett dataresidens- och audit-svar finns i
[`Human_Review_Demo_Talking_Points.md`](Human_Review_Demo_Talking_Points.md).

> Notera: vi är inte färdig-certifierade — vi har arkitekturen som möjliggör
> certifiering. Skillnaden bör vara explicit om en CIO trycker på frågan.

---

## Q4 — "Vad kostar en mapping i produktion?"

Med on-prem LLM (phi-default) är marginalkostnaden CPU/GPU-tid på egen hårdvara,
inte cloud-API. Demo-instansen kostar ~$0.02/mapping mot Anthropic;
produktion blir per-anrop flerfaldigt lägre.

> Djupare svar: kostnads-modell väntar på B24 (on-premise GPU-aktivering) för
> faktisk produktions-mätning. Idag har vi bara demo-cost som referens.

---

## Q5 — "Hur integrerar det med vårt befintliga journalsystem?"

FHIR R4-in, openEHR-ut. Båda är standardiserade gränssnitt — vilket journalsystem
som helst som talar FHIR kan skicka data in, och vilken openEHR-CDR som helst
kan ta emot ut.

> Djupare svar: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) +
> [`docs/EXTENDING.md`](../EXTENDING.md).

---

## Användning under demo

- Ha cheatsheet:n öppen på sidoskärm (eller skriv ut)
- Vid fråga som matchar exakt → svara med en-meningarna ovan, hänvisa till
  djupare doc om publik vill mer
- Vid fråga som inte matchar → "Det är värt en uppföljning, jag noterar och
  återkommer" — använd `Demo_Runbook.md` §8.1 för uppföljnings-noter
- Tonalitet: korrekt, inte säljande. CIO-publik märker direkt om en svaror är
  marknadsförd snarare än substantiell

---

## Revisionslogg

| Version | Datum | Ändring |
|---|---|---|
| v1 | 2026-05-11 | Initial leverans (B25.2 4.3). Fem Q&A med länkar till djupare resonemang. |

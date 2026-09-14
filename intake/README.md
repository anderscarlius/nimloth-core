# Intake — steg 0 i Smedjan

Detta är dropzonen. Hit lägger Anders (eller vem som helst med skrivrätt)
RÅTT material som beskriver ett problem eller en möjlig lösning — i vilket
format som helst: en PPT, skärmbilder, en löst skriven text, ett Slack-citat,
en länk till ett externt dokument. **Inget krav på struktur här.** Det är
poängen med intag — filtreringen och struktureringen händer i nästa steg,
inte innan.

## Flödet, i sin helhet

```
intake/<datum>-<kort-slug>/     ← RÅTT material, valfritt format (steg 0)
        ↓  (spec-granskning: en agent eller Anders läser/tolkar råmaterialet)
spec/<samma-slug>.md            ← EN formell specifikation, granskningsbar
        ↓  (godkännande — se .smedjan/agents.yaml, gates.medium_risk)
backlog/stories/<story-id>.md   ← nedbrutet till en eller flera user stories
        ↓  (exekvering)
services/<modul>/...            ← faktisk kod + tester
        ↓
tests/contracts/, CI            ← bevis att kontraktet hålls
```

## Så här lägger du till något

1. Skapa `intake/<ÅÅÅÅ-MM-DD>-<kort-beskrivande-slug>/`.
2. Lägg materialet där rakt av — `.pptx`, `.png`/`.jpg`, `.md`, `.pdf`,
   vad som helst. Om det bara är en textrad räcker en `README.md` med
   den texten.
3. Säg till (i chatt, eller genom att peka en agent på mappen) att den
   ska granskas. Granskningen producerar en `spec/<slug>.md` — se
   `spec/README.md` för vad en godkänd spec måste innehålla.
4. Efter godkänd spec: nedbrytning till `backlog/stories/`, se
   `backlog/stories/README.md`.

## Vad som INTE händer automatiskt

Att lägga något i `intake/` startar inte kodning av sig självt — steget
"spec-granskning" är ett medvetet stopp (per `.smedjan/agents.yaml`,
`gates.medium_risk`: agent kan dra ett förslag till spec, men den ska
läsas och godkännas innan nedbrytning till stories, och story-nedbrytning
ska godkännas innan kodning börjar). Se `intake/_template/` för en tom
mall att kopiera vid ett nytt intag.

## Exempel på ett redan kört intag (retroaktivt, för referens)

`B6 Etapp 1` (HbA1c-kedjan) kördes INTE genom detta flöde — det fanns
innan intake/-strukturen skapades. Se `spec/B6-etapp1-hba1c-kedjan.md`
och `backlog/stories/B6-etapp1-hba1c-kedjan.md` för hur den ser ut
retroaktivt beskriven i den nya strukturen, som ett konkret exempel att
utgå från.

# Spec — steg 1 i Smedjan (efter intag, före nedbrytning)

En spec här är den **granskningsbara, godkännbara** produkten av att
någon (agent eller Anders) har läst/tolkat råmaterialet i `intake/` och
skrivit ner: vad är problemet, vad föreslås, vad är klart-när, vad är
uttryckligen utanför scope.

## Var hör en spec hemma — här eller i `nimloth-docs`?

**Här (`nimloth-core/spec/`):** specar som är knutna till EN eller ett
fåtal moduler (`services/<namn>`) i det här repot, och som ska leva
tillsammans med koden de beskriver — så att de versioneras, granskas och
mergas i samma PR-flöde som implementationen.

**`nimloth-docs` (SynologyDrive, separat repo):** organisationsövergripande
strategi/arkitektur som spänner över flera repon eller inte är knuten till
en enda kodmodul — Nordstjärnan, Portstrategi, block-nivå-specar. Det är
redan den etablerade sanningskällan för den typen av dokument (se
`discovery-nimloth-2026-09-14`-rapporten §6) — **duplicera INTE dem här.**

Om du är osäker: om specen kan godkännas och sedan brytas ner till stories
UTAN att någon annan repo behöver läsas, hör den hemma här.

## Minimikrav för en godkänd spec

1. **Ursprung** — länk till `intake/<slug>/` (vad byggde specen på).
2. **Nuläge** — vad finns redan, verifierat (inte antaget) mot koden.
3. **Mål** — vad ska vara sant efteråt.
4. **Acceptanskriterier** — testbara, inte "bättre UX".
5. **Uttryckligen utanför scope.**
6. **Öppna frågor** — om det finns några, ställ dem HÄR, innan
   nedbrytning till stories, inte efteråt.

Se `B6-etapp1-hba1c-kedjan.md` i den här mappen för ett verkligt,
redan godkänt och kört exempel.

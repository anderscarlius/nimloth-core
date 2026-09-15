## Vad och varför

<!-- En till tre meningar. Länka till spec/story om det finns en
     (spec/<slug>.md, backlog/stories/<slug>.md) -- se tools/smedjan-console. -->

## Komponentgrinden

Kryssa av det som är sant, eller stryk och motivera det som inte gäller
för just denna PR (t.ex. en ren dokumentationsändring behöver inte alla).
Se `discovery-nimloth-2026-09-14`-rapporten §5.5 för bakgrund om varför
denna lista finns.

- [ ] **Publicerat kontrakt** — om detta inför eller ändrar ett gränssnitt
      (API, händelseschema, OPT) finns det dokumenterat, inte bara i koden.
- [ ] **Odeklarerat omöjligt i runtime** — om det finns ett måste/förbud
      (t.ex. "aldrig skriva utan vårdrelation"), går det inte att kringgå
      av misstag i koden.
- [ ] **Riktig data i demo** — om detta rör demoflödet, är datan syntetisk
      och `_source`-märkt om relevant (inte tyst blandad med riktiga poster).
- [ ] **Audit även på nekat** — om detta rör åtkomst/läsning, loggas ett
      nekat försök likaväl som ett godkänt.
- [ ] **Test i CI som fäller vid kontraktsbrott** — inte bara att koden
      gör rätt idag, utan att en framtida regression upptäcks automatiskt.
- [ ] **Dokumenterad avvecklingsväg** — om detta lägger till något som kan
      behöva tas bort senare (en flagga, en interimslösning), står det var.
- [ ] **Svenska för domän, engelska för kod** — variabel-/funktionsnamn på
      engelska, kommentarer om KLINISK/ORGANISATORISK mening på svenska.

## Test

<!-- Vad har du faktiskt kört, inte bara vad CI kommer köra. -->

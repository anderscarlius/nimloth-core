# tests/contracts — kontraktstester, steg "kodning/tester" i Smedjan

## Konvention: kontraktstester bor med sin modul, inte här

Ett kontraktstest hör hemma i `services/<modul>/src/__tests__/` (eller
motsvarande) tillsammans med resten av modulens tester — INTE flyttat
till en central mapp. **Denna mapp är bara för kontrakt som spänner över
flera moduler** (t.ex. "om `fhir-facade` ändrar ett event-schema, ska
BÅDE `transform` och `omop-projector` fortfarande kunna läsa det") — och
är tom idag eftersom inget sådant tvärmodul-kontraktstest ännu finns.

## Vad ett kontraktstest är, konkret (redan existerande exempel)

`infra/openehr/compiler/src/test/java/se/nimloth/openehr/compiler/
CompileMainTest.java` är det bästa redan-existerande exemplet i detta
repo:

- `everyRealNodeIdHasAMatchingTermDefinition` — fäller om kompilatorn
  producerar en OPT där ett node-id saknar sin term-definition (den
  faktiska bugg-klass som en gång kraschade EHRbase).
- `everyCodeListValueHasAMatchingTermDefinition` — samma idé, för
  kod-listvärden specifikt.
- `malformedAdlProducesClearErrorInsteadOfSilentGarbage` — fäller om ett
  trasigt indata-ADL tyst producerar skräp istället för ett tydligt fel.

Det som gör dessa till KONTRAKTStester och inte bara vanliga enhetstester:
de testar mot en **publicerad, extern förväntan** (EHRbase kräver vissa
fält för att inte krascha) — inte bara "gör funktionen vad jag skrev att
den ska göra".

## Komponentgrindens krav (discovery-rapporten §5.5)

> "test i CI som fäller vid kontraktsbrott"

är uppfyllt för openEHR-kompilatorn (ovan) men **saknas för de flesta
andra moduler** — det är en känd, dokumenterad lucka, inte något denna
mapp löser på egen hand. Varje ny story som inför ett nytt kontrakt
(ett event-schema, ett API-svar andra moduler beror på) bör lägga ett
test i samma anda i modulens EGEN testmapp, och bara lägga något HÄR om
kontraktet verkligen spänner över mer än en modul.

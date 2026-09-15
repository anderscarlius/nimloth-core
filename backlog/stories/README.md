# Backlog / stories — steg 2 i Smedjan (efter godkänd spec, före kodning)

En story här är EN nedbruten, exekverbar bit av en godkänd spec i
`../../spec/`. Format: en fil per story, `<story-id>.md`.

**Story-id-konvention:** `<spec-slug>` om specen bara ger en story, annars
`<spec-slug>-<löpnummer>` (t.ex. `B6-etapp2-source-honesty-ui-1`,
`-2` om den behöver delas upp ytterligare under arbetets gång).

## Minimikrav per story

- **Modul** — vilken `services/<namn>` (eller "flera": lista dem).
- **Spec** — länk till `../../spec/<slug>.md`.
- **Status** — `open` / `in-progress` / `done` / `parked`.
- **Acceptanskriterium** — EN sak, testbar. Om specen har flera kriterier
  och de naturligt hör ihop i en enda kodändring, är det okej att en
  story täcker flera — men var explicit om vilka.
- **Gate-nivå** — vilken av `.smedjan/agents.yaml`s tre nivåer
  (`low_risk`/`medium_risk`/`high_risk`) den här specifika exekveringen
  landar i. En story kan ha en annan gate-nivå än specens generella nivå
  om det konkreta jobbet råkar bli mindre/större risk än väntat.

## Statustavla (uppdateras manuellt tills vidare — se öppen fråga nedan)

| Story | Modul | Status |
|---|---|---|
| `B6-etapp1-hba1c-kedjan` | omop-projector, aql-template-service, data-generator | ✅ done |
| `B6-etapp2-source-honesty-ui` | dashboard | ✅ done |

**Öppen fråga, inte löst här:** ska detta i stället bli GitHub Issues
(discovery-rapporten §7.2 flaggade att Issues idag inte används alls i
nimloth-core)? Filbaserad backlog är enklast att komma igång med och
kräver ingen extra behörighetsmodell, men skalar sämre än Issues för
sökning/filtrering. Beslutas när/om filantalet blir ett problem — inte
en blockerare för att börja.

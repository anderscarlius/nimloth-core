# Demo Mode Configuration — `NIMLOTH_DATA_MODE`

**Status:** Operationell konfigurations-referens (B22.5).
**Användning:** Drift, audit, CIO-granskning, demo-förberedelse.
**Senast uppdaterad:** 2026-05-09
**Författare:** Anders Carlius
**Spec-referens:** `nimloth-docs/B22.5_Tier_Based_Sensitivity_Strategy.md`
**Versionerat:** ja (i nimloth-core).

---

## 1. Syfte

`composition-mapper` bär patientdata (PHI) i produktion. Hard-rule i
`packages/model-router` säger: PHI får aldrig routas till en provider med
`dataResidency != on-premise`.

För demo-presentationer och eval-iteration använder vi **syntetisk data**
— fabricerade FHIR-paket utan koppling till individ. Att tvinga
on-premise-routing även för syntetiska data är ineffektivt: Hemmabasens
NAS saknar GPU och 32B-modeller blir CPU-bundna (60-180s/anrop). Att
istället använda Anthropic-cloud för syntetisk data ger 1-3s/anrop — och
det är tekniskt korrekt eftersom datan inte är PHI.

Den arkitektoniska lösningen är inte att bryta on-premise-policyn för PHI,
utan att **separera PHI från syntetisk data** via en sensitivity-tier i
model-router.

## 2. Sensitivity-tier (model-router)

| Tier | Tillåtna `dataResidency` | Avsedd användning |
|---|---|---|
| `phi` | `on-premise` | Vårddata kopplad till individ. Hard-rule. |
| `pii` | `on-premise`, `eu-cloud` | Personidentifierare utan vårdsammanhang. |
| `synthetic` | `on-premise`, `eu-cloud`, `us-cloud` | Fabricerad data (eval-set, demo-fixtures). Inte PHI. |
| `schema-only` | alla | Tabellnamn, kolumnnamn, syntaxprover. |
| `public` | alla | Helt offentlig data. |

`synthetic` och `public` tillåter samma residency men är *semantiskt
olika*. `synthetic` betyder "data ser ut som PHI men är fabricerad".
`public` betyder "data är offentlig oavsett ursprung". Skillnaden är
audit-kontext.

Hard-rule för `phi` är hård-kodad i `residencyAllows()` i
`packages/model-router/src/router.ts`. Boot-time-validering i
`packages/model-router/src/config.ts` tvingar dessutom `require: on-premise`
för alla phi-routing-regler.

## 3. Konfiguration: `NIMLOTH_DATA_MODE`

`composition-mapper` läser `NIMLOTH_DATA_MODE` vid boot:

| Värde | Verkan |
|---|---|
| (ej satt) | `phi` — default. LLM-anrop märks `sensitivity: phi`. |
| `phi` | Identiskt med default. |
| `synthetic` | LLM-anrop märks `sensitivity: synthetic`. Cloud-routing tillåten. |
| Annat | Tolkas som `phi` (belt-and-suspenders säkerhet). |

Verifiering av aktivt läge sker via boot-loggen:

```
INFO: starting composition-mapper {port: 3001, scaffold: true, dataMode: 'phi'}
```

Vid `synthetic` tillkommer en prominent WARN-rad:

```
WARN: NIMLOTH_DATA_MODE=synthetic. LLM-anrop får routas till cloud-providers.
WARN: Detta läge är endast för demo med syntetisk data.
WARN: ALDRIG för produktion med riktiga patientdata.
WARN: Se docs/operations/Demo_Mode_Configuration.md.
```

Per LLM-anrop loggas dessutom valt `sensitivity`-läge:

```
INFO: llm-assist invocation {task: 'mapping.medication.compose', sensitivity: 'synthetic', attempt: 1}
```

## 4. Routing-regler för `mapping.medication.compose`

`config/model-routing.yaml` har två regler för samma task — en per
sensitivity-tier:

```yaml
# Production-default — PHI får aldrig lämna on-premise.
- task: mapping.medication.compose
  sensitivity: phi
  require: on-premise
  prefer:
    - { providerId: hemmabasen-ollama, model: qwen2.5-coder:32b }
  fallback:
    - { providerId: mock, model: mock-default }

# Demo/eval — syntetisk data tillåter cloud-routing.
- task: mapping.medication.compose
  sensitivity: synthetic
  prefer:
    - { providerId: anthropic-cloud, model: claude-sonnet-4-6 }
  fallback:
    - { providerId: mock, model: mock-default }
```

Routern grupperar regler på task-namn och väljer den vars `sensitivity`
matchar request. Ingen risk för korsbidrag — `phi`-request hittar bara
phi-regeln, `synthetic`-request hittar bara synthetic-regeln.

## 5. När får `synthetic` användas?

| Scenario | Tillåtet? |
|---|---|
| `pnpm eval` mot eval-set | **Ja** — eval-paren är manuellt skrivna med `Patient/test-XXX`-referenser. |
| Lokal utveckling med fixtures från `services/composition-mapper/eval-set/` | **Ja**. |
| Demo-presentation med eval-set-baserade fall | **Ja**. |
| Pilot mot region-instans med riktiga patient-data | **NEJ — alltid `phi`.** |
| Produktion (lakehouse-replikering, real source-systems) | **NEJ — alltid `phi`.** |
| QA-miljö med produktions-data-kopior | **NEJ — riktiga PII/PHI även om miljö är icke-prod.** |
| Lasttester med syntetiserad bulk-FHIR (genererad utan personreferens) | **Ja** — om datan bevisligen är fabricerad. |

Tumregeln: `synthetic` är endast korrekt om varje fält i FHIR-paketet är
manuellt skrivet eller deterministiskt genererat utan koppling till
någon individ. Om det finns ens en chans att data härstammar från en
riktig journal — använd `phi`.

## 6. Skydd mot oavsiktlig demo-mode i produktion

Tre lager:

1. **Default är `phi`.** Om ingen `NIMLOTH_DATA_MODE` är satt fungerar
   systemet i produktions-läge. Operatören måste aktivt sätta
   `synthetic` för att avvika.
2. **Boot-warning är obligatorisk.** WARN-loggen från sektion 3 går till
   stdout/structured-log och kan inte stängas av. Drift-system som
   samlar logs ser raden direkt — det blir omöjligt att råka köra
   demo-mode oupptäckt.
3. **Eval-runner sätter `dataMode: 'synthetic'` direkt på `LlmAssist`-
   instansen** istället för via env-variabel. Det förhindrar att eval-
   runnerns side-effects läcker till resten av processen om båda råkar
   köras i samma miljö.

I produktions-deploy (Sprint 5+) bör deploy-skript sätta
`NIMLOTH_DATA_MODE=phi` explicit som belt-and-suspenders. Default-
fallback täcker sig själv, men explicit-värdet hjälper audit-läsare att
se direkt att miljön är hård-låst.

## 7. Audit och provenance

Varje LLM-anrop genererar ett `RouterAuditEvent` med fält:

- `sensitivity` — exakt det värde routern använde för routing-beslutet.
- `providerId` + `dataResidency` — vilken provider som faktiskt körde
  anropet och var den ligger residency-mässigt.
- `promptHash` — SHA256 över prompten, deterministisk över körningar.

Det betyder att i audit-kedjan kan man bevisa: "detta anrop
markerades `synthetic` och routades till `anthropic-cloud`
(`us-cloud`)". Eller motsatsen: "detta anrop markerades `phi` och
routades till `hemmabasen-ollama` (`on-premise`)". Synligt åtkomstspår
för regulatoriska revisioner.

`EvalReport` (utdata från `pnpm eval`) får ett `dataMode`-fält som
dokumenterar körningens sensitivity-tier på rapport-nivå. Det är
referens-fältet vid CIO-granskning av eval-resultat.

## 8. Beslut bakom strategin

Sammanfattning av beslutslogiken (full motivering i strategi-dokumentet):

- Hemmabasen NAS är CPU-only och därför inte praktisk för 32B-modeller.
- VGR-hårdvarutillgång är osäker och troligen flera månader bort.
- Eval-paren är syntetiska — det är tekniskt korrekt att routa dem som
  icke-PHI.
- Alternativet (vänta på hårdvara, ingen demo) bryter demo-momentum och
  finansieringscykel.
- Att hard-koda Anthropic in i composition-mapper hade varit teknisk
  skuld. Att introducera `synthetic`-tier i model-router är en
  arkitektonisk förbättring som håller oavsett när hårdvara levereras.

Detta dokument utgör operationell referens. Strategi-resonemanget
finns i `nimloth-docs/B22.5_Tier_Based_Sensitivity_Strategy.md`
(icke-versionerat).

## 9. Referenser

- `nimloth-docs/B22.5_Tier_Based_Sensitivity_Strategy.md` (strategi)
- `packages/model-router/src/router.ts` (`residencyAllows()`)
- `packages/model-router/src/config.ts` (config-validering)
- `services/composition-mapper/src/config.ts` (`NIMLOTH_DATA_MODE`)
- `services/composition-mapper/src/mapping/llm-assist.ts` (`dataMode` propagation)
- `services/composition-mapper/src/eval/runner.ts` (auto-synthetic)
- `config/model-routing.yaml` (routing-regler)
- `docs/operations/Human_Review_Pathway_Design.md` (relation till review-pathway)
- `docs/operations/Human_Review_Demo_Talking_Points.md` §7 (CIO-fråga)

## 10. Revisionslogg

| Version | Datum | Ändring |
|---|---|---|
| v1 | 2026-05-09 | Initial leverans (B22.5). Demo-mode-konfiguration via `NIMLOTH_DATA_MODE`-env, sensitivity-tier `synthetic` i model-router, multi-rule routing per task. |

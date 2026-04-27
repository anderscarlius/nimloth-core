# Model routing

`@nimloth-core/model-router` är den delade lib:n som dirigerar LLM-anrop i Nimloth Core. Den introducerades i Sprint 2 (P4 — mapping-assistant) men är designad för att också tjäna Sprint 3 (Sambi/PDL-orkestrering), Sprint 5 (CDS-text-generering), och vidare bortom roadmapen.

## Varför

Nimloth Core kommer köra på heterogen infrastruktur. Vissa tjänster lever i ett centralt cloud-deploy där VGR:s integrationsteam når dem. Andra ska kunna köras på egen hårdvara — vårdcentraler, sjukhusgolv, edge-noder — där centrala funktioner kan vara otillgängliga och där känsliga vårddata aldrig får lämna lokalen.

Att hårdkoda en specifik LLM-leverantör i varje tjänst skulle innebära:

- Omöjligt att flytta en tjänst till on-premise utan kodändring
- Risk att PII/PHI råkar skickas till cloud-providers som inte är godkända
- Beroende av en provider för all text-generering — också för uppgifter där en lokal open-weights-modell skulle räcka

Routern löser detta genom att introducera ett **routing-lager** mellan koden och leverantören. Tjänsten ber router:n utföra en logisk task ("mapping.propose") med en deklarerad känslighetsnivå ("schema-only"), och router:n väljer rätt provider+modell utifrån policy.

## Komponenter

| Komponent | Ansvar |
|---|---|
| `RouterConfig` | Laddat från YAML, definierar tillgängliga providers och routing-regler per task |
| `Provider` | Implementation av en LLM-leverantör (Anthropic, Ollama, Mock) |
| `ModelRouter` | Kärnan som matchar task → regel → provider+modell, kör anropet, emitterar audit-event |
| `RoutingRule` | Per-task: sensitivity, eventuell hard-rule (`require: on-premise`), prefer-list, fallback-list |
| `RouterAuditEvent` | Strukturerat event per anrop (success / error / route-unavailable) — konsumeras av tjänster som vill skriva till `core.audit.<topic>` |

## Sensitivity-modellen

Fyra nivåer, inspirerade av VGR:s informationsklassning:

| Nivå | Beskrivning | Tillåtna providers |
|---|---|---|
| `public` | Publika referenser, dokumentation | Alla |
| `schema-only` | Tabellnamn, kolumnnamn, syntetiska samples | Alla |
| `pii` | Personidentifierare utan vårdsammanhang | on-premise eller eu-cloud |
| `phi` | Vårddata kopplad till individ | **endast on-premise** |

`phi` är en hard rule — router:n vägrar starta om en routing-regel med `sensitivity: phi` saknar `require: on-premise`. Det är medvetet strikt: en glipa skulle annars kunna skicka vårddata till cloud-providers som inte är godkända.

## Routing-algoritm

1. Slå upp routing-regel på task-namn. Saknas → `RouteUnavailableError`.
2. Validera att `req.sensitivity` matchar regelns sensitivity (skydd mot att uppströmskod råkar skicka phi-data märkt som schema-only).
3. Iterera `prefer` → `fallback`. För varje `(providerId, model)`:
   - Hoppa över providers som är `enabled: false`.
   - Hoppa över providers vars `dataResidency` bryter sensitivity-policy eller `require`.
   - Kör `provider.isHealthy()`. Hoppa över om false.
   - Anropa `provider.invoke()`. Returnera resultatet på success.
4. Inget alternativ funkade → kasta `RouteUnavailableError` + emittera `outcome: 'route-unavailable'`-audit.

## Konfigurationsfil

YAML i `config/model-routing.yaml`. Se `config/model-routing.yaml.example` för fullständigt schema. Validering sker vid load:

- Provider-typer måste vara `anthropic`, `ollama`, eller `mock`.
- `models[]` får inte vara tom.
- `routing[].prefer[].providerId` måste finnas i `providers[]`.
- `routing[].prefer[].model` måste vara deklarerad av providern.
- `sensitivity: phi` måste ha `require: on-premise`.

## Providers

### Anthropic (`type: anthropic`)
- API-key läses från env (default `ANTHROPIC_API_KEY`).
- Saknas key → `isHealthy()` returnerar false → router hoppar över.
- Använder `@anthropic-ai/sdk` mot `messages.create`.
- Modeller: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`.

### Ollama (`type: ollama`)
- HTTP-API mot `http://localhost:11434` (eller config-angiven endpoint).
- Healthcheck: `GET /api/tags`.
- För on-premise-deploy: starta Ollama på samma host eller nät-tillgänglig maskin.
- I Sprint 2 är providern funktionell men `enabled: false` per default — operatören väljer aktivt att aktivera.

### Mock (`type: mock`)
- Deterministiska fixtures matchade på substring av prompt.
- Används för CI-tester och demo utan API-credit.
- Kan användas i fallback för att låta `mapping.ask` "tyst svara nej" när Ollama inte är konfigurerad ännu.

## Audit

Varje invoke emitterar ett `RouterAuditEvent` synkront till en valfri `audit`-callback. Mapping-assistant använder detta för att skriva till sin `audit_outbox` (SQLite), som sedan drainas till `core.audit.mapping` (Kafka).

Eventet innehåller:

- `task`, `providerId`, `modelUsed`, `dataResidency`, `sensitivity`
- `promptHash` — SHA256 av (systemPrompt + '\n---\n' + userPrompt). Deterministisk; samma prompt ger samma hash. Används för proveniens (matchas mot template-SHA i `prompt-signing.md`).
- `inputTokens`, `outputTokens`, `latencyMs`
- `outcome`: `success | error | route-unavailable`

## Distribuerad drift

Routern är medvetet **portabel**:

- Konfigurationen är en YAML-fil — kan packas in i image eller mountas in.
- Ingen central state. Varje tjänst har sin egen router-instans.
- Audit-events bufras lokalt (i SQLite-outbox för mapping-assistant) — Kafka-nere innebär inte att tjänsten slutar fungera.
- Anthropic-provider degraderar tyst till `unhealthy` när API-key saknas — tjänsten startar ändå, mock-fallback används.

## Sprint 3+ — utbyggnader

Tre kända utbyggnader att hålla i åtanke:

1. **Eu-cloud-providers** — Anthropic via AWS Bedrock i eu-frankfurt, Mistral La Plateforme i Paris. Lägg till som extra `type: anthropic-bedrock` eller `type: mistral` providers. Sensitivity `pii` kommer kunna routas dit.
2. **Sambi-OIDC-tunnling** — när tjänsten anropas av en användare via Sambi/SITHS ska användarens HSA-id loggas i audit-event. Kräver att `InvokeRequest` får ett valfritt `principal`-fält.
3. **Cost-throttling** — token-budget per task per dygn. Routern blir state-håller (Redis eller liknande). Lågprioriterade tasks degraderas till mock när kvoten passerats.

Inget av detta byggs i Sprint 2 — men interfacet stödjer det utan API-bryt.

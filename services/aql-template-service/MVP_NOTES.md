# aql-template-service — MVP-skuld

Tjänsten är en Kontrakt 1-konform MVP. Form (paths, request/response, error
shape) följer Datakontraktet kapitel 3 + bilaga 14. Innehåll har medvetna
genvägar listade nedan — varje rad spårar till framtida förfining.

## Bortvalda (POST-MVP) drag

| Område | MVP-genväg | Framtida förfining |
|---|---|---|
| **Auth** | `mockAuth` släpper igenom alla anrop oavsett Authorization-header. | HSA-ID via PASETO/JWT-validering. Misslyckas → 401 med strukturerat fel. |
| **ABAC-applikation** | Inga attribut läses, inga policies tillämpas. | ABAC-policy-evaluator läser caller-attribut (vårdrelation, samtycke, syfte) och avgör read-tillgång per resurs. |
| **Cache** | Inga cache-headers; varje execute slår mot EHRbase. | ETag + `Cache-Control: max-age` på list/get. Execute är inte cache-bar i MVP men kan bli det per (template, params)-hash. |
| **Sessionskontext** | Validerar inte att caller har en aktiv vårdrelation till `patient_id`. | Sessionskontext-tjänst kollar HSA-organisation, samtycke, syfte vid execute-tid. |
| **Capabilities-endpoint** | Inte implementerad. | `GET /.well-known/capabilities` för Studio + agent-introspection per kontraktet. |
| **Audit** | Strukturerade pino-loggar, inget Kafka-publicerande. | Audit-events till `core.audit.access` (samma topic som bridge-audit i openehr-composer). |
| **Rate limiting** | Ingen. | Per-caller token-bucket vid LB-laget eller via middleware. |
| **Pagination** | List returnerar hela uppsättningen (5 mallar — trivialt). | Cursor-paginering när registret växer förbi ~50 mallar. |
| **Versioning** | `template.version` finns på descriptor men ingen multi-version-stöd i registry. | Registry index keyed by (id, version); fall-back till senaste vid utelämnad. |
| **Output-schema-validering** | `output.columns` deklareras men runtime kontrollerar inte att EHRbase-svaret matchar. | Schema-validator vid execute för att fånga drift mellan template-deklaration och EHRbase-svar. |

## INTE bortvalt (kontrakt-relevant och här i MVP)

| Område | Status |
|---|---|
| Endpoint-form per kontrakt | ✓ |
| Parameter-spec med required/default/typ | ✓ |
| Strukturerade fel-objekt (400/404/500) | ✓ |
| `meta` med executed_at, row_count, latency | ✓ |
| INVARIANT 2 S4-validator vid mall-laddning | ✓ |
| Befordringsgräns (tier=honest only) | ✓ |
| Param-typsanitering före AQL-substitution | ✓ |

## Scope-gränser (Fas 2 S2)

- **Kontrakt 2 (FHIR-mallar):** UTANFÖR scope.
- **Kontrakt 3 (event-bus-fasad):** UTANFÖR scope.
- **Kontrakt 4 (ABAC 13:e attribut):** UTANFÖR scope.
- **Kontrakt 5 (audit-schema):** UTANFÖR scope.
- **Studio:** UTANFÖR scope.
- **SDG/substratet:** låst — inga ändringar i data-generator från Fas 2.

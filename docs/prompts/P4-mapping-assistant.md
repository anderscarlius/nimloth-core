# Prompt P4 — Mapping-assistant (AI-assisterad mappning)


## Kontext

7 handkodade mappers (ärvt från Nimloth Flow). Linjär skalning. Artikelserien argumenterar emot detta. Lösning: AI genererar draft, människa godkänner, AI övervakar.

## Mål

Skapa `services/mapping-assistant/` med tre flöden: *propose* (ny källa → AI-utkast + REVIEW.md), *observe* (kvalitetsmetrics → förslag), *ask* (låg confidence → pausa + be). All AI-aktivitet loggad i `core.audit.mapping`. Dashboard-vy `/mappings`.

## Leverans

- Ny tjänst `services/mapping-assistant/` (package: `@nimloth-core/mapping-assistant`)
- CLI `pnpm mapper:propose`
- Dashboard-vy `services/dashboard/src/pages/Mappings.tsx`
- Nytt Kafka-topic `core.audit.mapping` (compact+delete)
- Policies-fil `services/mapping-assistant/src/policies.ts`

## Steg

1. Skapa tjänsten:
   ```
   services/mapping-assistant/
     src/
       server.ts           # Express, port 3009
       proposer.ts
       observer.ts
       asker.ts
       policies.ts
       claude-client.ts
       suggestion-store.ts
       audit.ts
   ```
2. Claude-client: `@anthropic-ai/sdk` mot `claude-opus-4-7`. Prompts i `services/mapping-assistant/prompts/`:
   - `propose-mapping.md`
   - `explain-skip.md`
   - `identify-pattern.md`
3. Endpoints:
   - `POST /propose` — `{ source, target }` → `{ mapperCode, reviewNotes, confidence }`
   - `GET /suggestions?status=pending`
   - `POST /suggestions/:id/approve`
   - `POST /suggestions/:id/reject`
4. Proposer-flöde:
   - Läs källtabellens schema via `information_schema.columns`
   - Hämta 50 samplerader
   - Hämta målstruktur (FHIR-profil eller openEHR-template)
   - Claude API-anrop med strukturerad prompt
   - Validera TypeScript-output (typescript compiler API)
   - Skriv till `services/transform/src/mappings/proposed/<n>.ts` + `REVIEW.md`
5. Observer-flöde:
   - Kafka-consumer på `core.system.quality.metrics`
   - Aggregera rullande 24h per `skipReason` + `sourceTable` + `columnName`
   - Tröskel (default 10 events) → skapa suggestion via Claude
6. Asker-flöde:
   - Transform utökas med `confidence`-fält
   - `confidence = 'low'` → stoppa eventet, publicera `mapping.pending`
7. Policies:
   ```typescript
   export const RISK_POLICIES = {
     new_enum_value: { riskLevel: 'low', autoSuggest: true, blockEvents: false },
     new_column: { riskLevel: 'medium', autoSuggest: true, blockEvents: true },
     new_table: { riskLevel: 'medium', autoSuggest: true, blockEvents: true },
     new_table_with_pii_no_patient_ref: {
       riskLevel: 'high', autoSuggest: false, blockEvents: true, alertOnCall: true
     },
   };
   ```
8. Dashboard-vy `/mappings`:
   - Lista pending suggestions
   - Buttons: Godkänn, Redigera-i-editor, Avvisa
   - Redigera → CodeMirror-modal
   - Godkänn → POST → skriv fil → transform-restart
9. Audit-topic schema:
   ```json
   {
     "eventType": "suggestion_created" | "suggestion_approved" | "suggestion_rejected" | "mapper_auto_applied",
     "modelVersion": "claude-opus-4-7",
     "promptHash": "sha256:...",
     "suggestedRule": { ... },
     "approver": { "hsaId": "...", "role": "..." },
     "timestamp": "..."
   }
   ```
10. CLI i root `package.json`:
    ```json
    "scripts": {
      "mapper:propose": "node services/mapping-assistant/dist/cli/propose.js"
    }
    ```

## Acceptans

- `pnpm mapper:propose --source flexlab-db --table results --target core.clinical.lab.result` genererar fungerande TS-mapper + REVIEW.md.
- Mapparen kompileras när flyttad till `mappings/` och registrerad.
- Simulerad skippat event: 10 events med `order_type=URGENT_HOME` → suggestion dyker upp i `/mappings`.
- `curl http://localhost:8080/topics | grep "core.audit.mapping"` bekräftar topic.
- Godkänt förslag loggas i `core.audit.mapping` med HSA-id + modellversion.

## Tekniska noteringar

- `ANTHROPIC_API_KEY` i `.env`. Exempel i `.env.example`.
- Prompt-hash: SHA256 av systemprompt + user-prompt.
- API-retries: 3 med exponential backoff.
- **Säkerhet:** mapping-assistant skriver INTE direkt till `mappings/` — bara till `proposed/`. Manuell flytt = enda vägen till produktion.

**Dependencies:** inga hårda.

---


# Prompt P7 — CDS-regler: PlanDefinition + CQL-runner POC


## Kontext

Tre hårdkodade CDS-regler i `services/cds-hooks/` (ärvt från Nimloth Flow). Målbild: PlanDefinition + CQL. Full migrering = 4–5 veckor; denna prompt gör steg 1–3 av 6 (förbered + parallelldrift, utan motorbyte).

## Mål

Dokumentera existerande regler som PlanDefinition + CQL. Lägg till `core.audit.cds`. Implementera parallell `cql-runner.ts`. Kör parallellt med hårdkodad Waran, jämför utfall i `core.system.cds.diff`.

## Leverans

- `cds/plans/` med 3 PlanDefinitions + 3 CQL-bibliotek
- `services/cds-hooks/src/cql-runner.ts`
- `services/cds-hooks/src/runners/waran-cql.ts`
- Nytt topic `core.audit.cds`
- Nytt topic `core.system.cds.diff`
- Dashboard-indikator för CDS-status

## Steg

1. `cds/plans/`:
   ```
   cds/plans/
     waran-profylax/
       plan-definition.json
       waran-profylax.cql
     implant-alert/
       plan-definition.json
       implant-alert.cql
     dvt-risk/
       plan-definition.json
       dvt-risk.cql
   ```
2. CQL Waran:
   ```cql
   library WaranProfylax version '1.0.0'
   using FHIR version '4.0.1'
   context Patient
   
   define "OnWarfarin":
     exists([MedicationStatement] M
       where M.medicationCodeableConcept.coding.code in { 'B01AA03' }
         and M.status = 'active')
   
   define "LatestINR":
     Last([Observation: code in "INR codes"] O sort by effective)
   
   define "NeedsPreOpINRCheck":
     "OnWarfarin" and (
       "LatestINR" is null
       or "LatestINR".effective before Today() - 1 day
     )
   ```
3. PlanDefinition:
   ```json
   {
     "resourceType": "PlanDefinition",
     "id": "waran-profylax",
     "version": "1.0.0",
     "status": "active",
     "trigger": [{ "type": "named-event", "name": "patient-view" }],
     "library": ["Library/waran-profylax"],
     "action": [{
       "condition": [{
         "kind": "applicability",
         "expression": { "language": "text/cql", "expression": "NeedsPreOpINRCheck" }
       }],
       "dynamicValue": [
         { "path": "indicator", "expression": { "expression": "'critical'" }},
         { "path": "summary", "expression": { "expression": "'Antikoagulerad patient — kontrollera INR'" }}
       ]
     }]
   }
   ```
4. CQL-runner (`services/cds-hooks/src/cql-runner.ts`):
   - `cql-execution` (npm)
   - Wrapper:
     ```typescript
     export async function runCql(library: string, fhirBundle: Bundle, expression: string) {
       const lib = compileCqlToElm(library);
       const executor = new Executor(lib);
       const patientSource = new PatientSource.FHIRv400(fhirBundle);
       const result = await executor.exec_patient_context(patientSource);
       return result.patientResults[expression];
     }
     ```
5. Parallell runner (`runners/waran-cql.ts`):
   - Vid `patient-view`: kör både `waran.ts` och `waran-cql.ts`
   - Returnera hårdkodat till klienten
   - Publicera diff till `core.system.cds.diff`
6. `core.audit.cds` schema:
   ```json
   {
     "rule": "waran-profylax",
     "version": "1.0.0",
     "engine": "hardcoded" | "cql",
     "hook": "patient-view",
     "patient_pnr": "...",
     "user_hsa": "...",
     "result": { "indicator": "critical", "summary": "..." },
     "timestamp": "..."
   }
   ```
7. Dashboard CDS-status:
   - "3 hårdkodade regler aktiva"
   - "3 CQL-regler tolkade (parallelldrift)"
   - "0 avvikelser senaste 24h"
8. Test `cql-parity.test.ts`:
   - Hårdkodad waran mot Fru Andersson → kritiskt kort
   - CQL waran mot Fru Andersson → samma kritiska kort
   - Assert paritet

## Acceptans

- `cds/plans/` innehåller 3 PlanDefinition + 3 CQL-filer
- Befintligt demo oförändrat (CQL parallelldrift påverkar inte klientsvar)
- `core.audit.cds` och `core.system.cds.diff` skapade
- Vid hook: både audit + ev. diff publiceras
- `pnpm --filter @nimloth-core/cds-hooks test cql-parity` grönt
- Dashboard visar "3 CQL-regler tolkade, 0 avvikelser"

## Tekniska noteringar

- `cql-execution` LGPL. OK för användning; distribuerade ändringar måste vara LGPL.
- CQL→ELM kräver `cql-translator` (JVM). Alternativ: pre-kompilera vid build-tid.
- Framtida steg (utanför denna prompt): faktiskt byta ut hårdkodade runners. Görs när diff=0 i 30 dagar.

**Dependencies:** inga.

---

# Bilaga A — Gemensamma konventioner

**Kodformat.** Nya tjänster följer struktur som befintliga: TypeScript ESM/NodeNext, Express eller Fastify, Dockerfile, `package.json` med `name: @nimloth-core/<service>`, vitest.

**Port-mappning.** Nya tjänster:
- Terminology: 3008
- Mapping-assistant: 3009
- HSA: 3011
- PDL: 3012
- NPÖ-client: 3013
- Pascal-client: 3014
- Care-unit-edge (dalsland): 5003–5004 (host), 3003–3004 (container)
- EHRbase: 8080 (host)
- MinIO: 9000–9001
- Iceberg REST: 8181

**Env-konvention.** Alla nya tjänster `<SERVICE_UPPER>_<VAR>`. Exempel: `TERMINOLOGY_SNOWSTORM_URL`, `MAPPING_ASSISTANT_CLAUDE_API_KEY`.

**Audit-topics.** Följer `core.audit.<domain>` med compact+delete.

**Testning.** Per tjänst:
- Unit-tester i `src/__tests__/`
- Integration i `packages/e2e/`
- Scenario i demo-scripts

**Bakåtkompatibilitet.** Ingen prompt får bryta `./scripts/start.sh && ./scripts/demo-fru-andersson.sh`. Nya tjänster läggs till med flags/profiles; default oförändrat.

**Dokumentation.** Varje prompt uppdaterar `docs/ARCHITECTURE.md` + `docs/EXTENDING.md` efter implementation.

---

# Bilaga B — Sprintar

| Sprint | Prompt | Veckor | Leverans |
|---|---|---|---|
| 1 | P1 Terminologi | 2 | Snowstorm + HAPI + services/terminology |
| 1 | P2 Care-unit-edge | 2 (parallellt) | SQLite + HTTP sync + offline-resilient vårdcentral |
| 2 | P3 openEHR | 3 | EHRbase + composer + templates + CANONICAL_STORE |
| 2 | P4 Mapping-assistant | 3 (parallellt) | Propose + Observer + Asker + /mappings |
| 3 | P5 Inera-stack | 3 | HSA + SITHS + PDL + Keycloak + NPÖ + Pascal |
| 4 | P6 Lakehouse | 3 | MinIO + Iceberg + bronze + silver + OMOP gold |
| 5 | P7 CDS-regler | 3 | PlanDefinitions + CQL-runner parallell + audit.cds |

Total: 14 veckor.

---

# Bilaga C — Referenser

- `docs/ROADMAP.md` — operativ sprintplan
- `Nimloth_Core_Utbyggnadsplan.md` — arkitekturell rationale
- `docs/ARCHITECTURE.md` — målbild
- `docs/POSITIONING.md` — Nimloth-familjen
- Nimloth Flow repo — pre-fork-referens
- openEHR CKM: https://ckm.openehr.org/
- Snowstorm Lite: https://github.com/IHTSDO/snowstorm
- EHRbase: https://ehrbase.org/
- Apache Iceberg: https://iceberg.apache.org/
- OMOP CDM 5.4: https://ohdsi.github.io/CommonDataModel/
- cql-execution: https://github.com/cqframework/cql-execution
- HL7 CDS Hooks 1.1: https://cds-hooks.hl7.org/1.1/
- HL7 CPG-on-FHIR: https://hl7.org/fhir/uv/cpg/

# Nimloth Core — Roadmap

**Status:** levande dokument
**Senast uppdaterad:** 2026-04-28
**Scope:** Sprint 0–5 (14 veckor) + Beyond

---

## 1. Versionering

Nimloth Core följer semantic versioning anpassad för plattformsprodukter:

- **0.x.y** — pre-produktion. Arkitekturell utveckling pågår. Bryter API:er mellan minor releases.
- **1.0.0** — produktionsklar i scope som definierats av Sprint 5. Stabilt externt kontrakt.
- **1.x.y** — inkrementella förbättringar med bakåtkompatibilitet.
- **2.0.0** — nästa större arkitekturella skifte (ej planerat).

Varje sprint avslutas med en version-release. Ingen release utan grön Fru Andersson-demo.

---

## 2. Sprint 0 — Baseline och positionering (1 vecka)

**Mål:** Etablera Nimloth Core som eget repo med klar identitet. Befintlig kod (ärvd från Nimloth Flow) fungerar men byggs inte ut. Sprint 0 handlar om dokumentation, versionering och infrastrukturellt förarbete.

### Leverans — version `0.1.0`

- [ ] Repo-fork genomförd enligt `Forkplan_Nimloth_Core_och_Flow.md`
- [ ] Rename genomförd (topics, packages, containers, env-variabler)
- [ ] README, POSITIONING, ARCHITECTURE, ROADMAP skrivna
- [ ] CI/CD uppkopplad mot nytt image-registry-namespace
- [ ] Fru Andersson-demo grön på både single-node och distribuerat läge
- [ ] Prompter P1–P7 placerade i `docs/prompts/` med möjlighet att itereras innan körning

### Exit-kriterier

- `./scripts/start.sh && ./scripts/demo-fru-andersson.sh` kör utan fel
- `./scripts/start-distributed.sh && ./scripts/simulate-network-failure.sh` kör utan fel
- Inga referenser till `vgr-datahub`, `@vgr/*`, `datahub-db` någonstans i kod eller dokumentation
- Första release `0.1.0` taggad och pushad

---

## 3. Sprint 1 — Terminologi + vårdcentralsnivå (2 veckor)

**Mål:** Ersätt hårdkodade terminologitabeller med en tjänstebaserad lösning. Börja bygga resiliensskiktet för mindre vårdenheter.

### Prompts

- **P1 — Terminologitjänst** (Snowstorm + HAPI FHIR Terminology + lokal proxy)
- **P2 — Care-unit-edge** (lättviktsruntime för vårdcentraler)

Prompts körs parallellt — de är oberoende.

### Leverans — version `0.2.0`

- [ ] Snowstorm-container med SNOMED CT subset laddad
- [ ] HAPI FHIR Terminology med LOINC + ICD-10-SE
- [ ] `services/terminology/` som proxy med cache och fallback
- [ ] Migrerade transform-mappers som använder terminologitjänsten
- [ ] `services/care-unit-edge/` med SQLite + HTTP sync
- [ ] Central sync-API: `POST /sync/push`, `GET /sync/pull`, `POST /sync/heartbeat`
- [ ] Demo-script `simulate-vardcentral-offline.sh`
- [ ] Topologivy utökad med ikoner för sjukhus-edge vs care-unit-edge
- [ ] Dokumentation uppdaterad

### Exit-kriterier

- Terminologitjänsten svarar korrekt även när Snowstorm är nere (fallback fungerar)
- Vårdcentralen Bengtsfors (mock-instans) klarar 4h offline med fortsatt klinisk funktion
- Fru Andersson-demo oförändrad

### Beroenden

- Inga externa beroenden. Kan starta direkt efter Sprint 0.

---

## 4. Sprint 2 — openEHR + AI-mapping (3 veckor)

**Mål:** Införa openEHR som parallellt kanoniskt lager. Avlasta handkodning av mappers med AI-assistans.

### Prompts

- **P3 — openEHR parallellt kanoniskt lager** (EHRbase + composer + templates)
- **P4 — Mapping-assistant** (AI-driven propose/observe/ask)

Prompts körs parallellt — de är oberoende.

### Leverans — version `0.3.0`

- [ ] EHRbase-container med PostgreSQL
- [ ] 7 openEHR-templates baserade på internationella CKM-arketyper
- [ ] `services/openehr-composer/` som konsumerar clinical events och skriver compositions
- [ ] `CANONICAL_STORE`-flag i FHIR Facade med AQL-översättningslager
- [ ] `GET /fhir/r4/Patient/{id}/$everything?store=both` visar paritet
- [ ] `services/mapping-assistant/` med tre flöden (propose, observe, ask)
- [ ] Dashboard-vy `/mappings` med godkännande/avvisande
- [ ] Audit-topic `nimloth.audit.mapping` med modellversion och prompt-hash
- [ ] CLI `pnpm mapper:propose`
- [ ] Demo: "Lägg till FlexLab på 10 minuter med AI-förslag"

### Exit-kriterier

- `CANONICAL_STORE=openehr` passerar Fru Andersson-demo identiskt med `=postgres`
- Diff-endpoint returnerar tom eller bara teknisk diff mellan stores
- Mapping-assistant genererar kompilerbar TypeScript för en ny källtabell
- Observer-flödet fångar simulerade okända koder och föreslår mappning

### Beroenden

- Ingen hård dependency mot Sprint 1. Kan köras utan P1/P2 klara.

### Risker

- openEHR-template-arbete är tidskrävande första gången. Om templates drar över — skjut icke-kritiska templates (Labb, Encounter) till Sprint 4.
- Claude API-latens kan påverka propose-flödet. Om det blir ett problem: cacha template-beskrivningar lokalt.

---

## 5. Sprint 3 — Inera-stacken (3 veckor)

**Mål:** Bygg in strukturellt stöd för identitets- och katalogstacken. Lyft PDL till egen microservice. Förbered för SITHS-verifiering även om det initialt körs med testcertifikat.

### Prompts

- **P5 — Inera-stack** (HSA + SITHS + PDL + Keycloak + NPÖ + Pascal)

### Leverans — version `0.4.0`

- [ ] `services/hsa/` med testkatalog (20 vårdenheter, 50 personer)
- [ ] SITHS test-CA + 5 testcertifikat
- [ ] Keycloak-realm `nimloth-core` med OIDC + SITHS cert-federation
- [ ] Mockad Sambi IdP för federation-testning
- [ ] `services/pdl/` som decision service
- [ ] FHIR Facade middleware: client-cert + JWT + PDL-tjänst-anrop
- [ ] `services/npo-client/` för NPÖ-synkronisering
- [ ] `services/pascal-client/` för läkemedelsförteckning
- [ ] `AUTH_MODE=dev|siths`-flagga för att stödja både demo och cert-baserad drift
- [ ] Dashboardens login-flöde via Keycloak

### Exit-kriterier

- `AUTH_MODE=dev` + befintligt demo fungerar oförändrat
- `AUTH_MODE=siths` kräver giltig client-cert för FHIR-anrop
- HSA-sökning mot mockad katalog returnerar rätt person + roll
- PDL-tjänsten returnerar strukturerat beslut för scenarion med/utan vårdrelation, med/utan spärr
- NPÖ-data syns i PatientOverview med källbadge "NPÖ"

### Beroenden

- Soft dependency på Sprint 1 (P2): care-unit-edge behöver kunna köra PDL offline. PDL-tjänsten ska kunna paketeras som library.

### Risker

- Inera-schemat för HSA är komplext; håll testkatalogen minimal men semantiskt korrekt.
- Keycloak-konfig kan vara bräcklig. Exportera realm som JSON och committa; deploy via import inte manuell konfig.

---

## 6. Sprint 4 — Lakehouse + OMOP (3 veckor)

**Mål:** Implementera sekundäranvändningsspåret. Bronze/silver/gold med OMOP som analytiskt format.

### Prompts

- **P6 — Lakehouse** (MinIO + Iceberg + bronze + silver + OMOP gold)

### Leverans — version `0.5.0`

- [ ] MinIO + Iceberg REST catalog i compose-stacken
- [ ] `services/lakehouse-bronze/` som konsumerar all CDC och skriver Parquet
- [ ] `services/lakehouse-silver/` som konsumerar clinical events och skriver per domän
- [ ] `services/lakehouse-gold-omop/` som översätter silver till OMOP CDM 5.4
- [ ] OMOP-vocabulary (ATHENA-export) laddad i gold
- [ ] Sekundär endpoint: `GET /api/v1/secondary-data/omop`
- [ ] Datakvalitet-vy i dashboard med bronze/silver/gold-status
- [ ] Demo-script `demo-omop-analytics.sh`

### Exit-kriterier

- Alla tre lager ackumulerar data när stack körs
- OMOP-query mot gold returnerar matchande tal mot silver
- CDS Hooks använder inte lakehouse (kontrakt-separation upprätthålls)
- PDL-checkpoint på secondary-endpoint kräver `purpose=RESEARCH`

### Beroenden

- Inga hårda. Oberoende av Sprint 1-3.

### Risker

- OMOP-vocabulary-download är stor (~5 GB). Gör one-time bootstrap i dedikerad volym.
- Iceberg-ekosystemet är relativt ungt. Verifiera DuckDB + Iceberg-extension fungerar innan hela spåret byggs.

---

## 7. Sprint 5 — CDS-regler med CQL (3 veckor)

**Mål:** Förbered migreringen från hårdkodade CDS-regler till PlanDefinition + CQL. Sprint 5 gör steg 1–3 av 6 i full migrering; kvarvarande steg följer i efterföljande mindre sprintar.

### Prompts

- **P7 — CDS-regler PlanDefinition + CQL-runner POC**

### Leverans — version `0.6.0`

- [ ] `cds/plans/` med 3 PlanDefinitions + 3 CQL-bibliotek
- [ ] `services/cds-hooks/src/cql-runner.ts` baserad på `cql-execution`
- [ ] Parallelldrift: hårdkodad Waran + CQL Waran kör båda, diff loggas
- [ ] Audit-topic `nimloth.audit.cds`
- [ ] Diff-topic `nimloth.system.cds.diff`
- [ ] Dashboard-indikator för CDS-status + avvikelser
- [ ] Test `cql-parity.test.ts` som verifierar paritet

### Exit-kriterier

- Parallelldriften påverkar inte klientens svar (hårdkodat resultat fortfarande auktoritativt)
- Diff-topic populeras med events; 0 avvikelser för Fru Andersson-testdata
- PlanDefinitions valideras mot HL7 CDS Hooks 1.1
- CQL-biblioteken kompilerar till ELM utan fel

### Beroenden

- Ingen hård dependency. Oberoende av Sprint 1-4.

### Risker

- `cql-execution` är LGPL-licensierat. Licens-granskning innan produktion.
- CQL-till-ELM-kompilering kräver separat verktyg (Java-baserad). Pre-kompilera vid build-tid.

---

## 8. Sprint 5.5 — Release candidate (1 vecka)

**Mål:** Stabilisering innan `1.0.0`.

### Aktiviteter

- [ ] Komplett e2e-testsvit körs
- [ ] Demo-script verifierade för alla fem sprintar (P1-P7 integrerat)
- [ ] Säkerhetsgranskning: penetration tests, dependency audit, OWASP Top 10
- [ ] Performance benchmarks: <1s svarstid för journalöppning, <3s modulväxling
- [ ] Dokumentationsgenomgång: alla publika API:er dokumenterade
- [ ] CHANGELOG från `0.1.0` till `1.0.0` skrivet

### Leverans — version `1.0.0-rc1`

Kandidat för första produktionsversion. Om kritiska buggar hittas under RC-perioden: fixa + ny RC. När RC är stabil under 2 veckor → `1.0.0`.

---

## 9. Beyond Sprint 5 — framtida arbete

Bortom Sprint 5 finns flera arbetsströmmar som inte är prioriterade men bör vara synliga i roadmapen:

### Tekniska

- **Full CDS-migrering:** Byt ut hårdkodade regler mot CQL (steg 4–6 av migreringen från P7). När diff-topic visat 0 avvikelser i 30 dagar.
- **Helm-charts för Kubernetes-deploy** — ersätter Docker Compose i produktion.
- **Avro + Schema Registry** — strukturerade event-schema för alla clinical topics.
- **SMART on FHIR launch** — så att externa EHR:er kan starta Nimloth in-context.
- **Fler source-system-anslutningar** — Take Care, Cosmic, Cambio Cosmic.
- **Fler edge-lokationer** — templates för hemsjukvård, mobil vård, ambulans.
- **Client-edge som PWA** — IndexedDB + Service Worker.
- **Automatisk conflict-resolution** — utökad CRDT-liknande logik vid reconnect.

### Arkitekturella

- **Mikrotjänst-separation** — när modulgränser är stabila, bryt ut specifika domäner till egna services.
- **Multi-tenant** — en Nimloth Core-instans för flera regioner eller vårdgivare.
- **Full EHDS-compliance** — när EHDS-förordningen är i full drift (2026+).

### Klinisk utvecklingsröstning

- **Fler openEHR-templates** — täck fler kliniska domäner (psykiatri, barnmedicin, onkologi).
- **Clinical workflows-motor** — strukturerat stöd för vårdprocesser utöver datalagring.
- **Datakvalitets-reconciliation** — periodisk sanity-check mot källsystem.

### Integration mellan Flow och Core

Om Scenario B (Flow som ingest-motor för Core) blir aktuellt: egen arkitekturdiskussion med specifik integrationsplan. Inte automatisk konsekvens av fork-strukturen.

---

## 10. Status idag

| Komponent | Status | Kommentar |
|---|---|---|
| Repo-fork från Flow | ✅ Klar | Genomförd 2026-04-25 enligt forkplan |
| Sprint 0 | ✅ Klar | Identitetsdokument + ARCHITECTURE för Sprint 5-målbild |
| Sprint 1 — P1 + P2 | ✅ Klar | Terminologitjänst (P1) + care-unit-edge (P2) levererade |
| Sprint 2 — P3.0 | ✅ Klar (pivot C) | Compiler foundation. AOM→XML-OPT-bridge lyft till P3.0b |
| Sprint 2 — P3.1 | ✅ Klar | Composer foundation. 6 nya CKM-arketyper + fixture-baserade compositions. P3.0b empiriskt scopad till 13 RM-typer |
| Sprint 2 — P3.0b | ⏳ Empiriskt scopad | AOM→XML-OPT-bridge. Bör starta efter P3.2 enligt P3.1-rapport |
| Sprint 2 — P3.2 | 🔜 Nästa | Kafka-integration för composer |
| Sprint 2 — P3.3 | ⏳ Specificerad | AQL-broker + CANONICAL_STORE-flag |
| Sprint 2 — P3.4 | ⏳ Specificerad | Paritetsdiff-endpoint |
| Sprint 2.5 — P4 | ⏳ Väntar | Mapping-assistant. Lyft till egen Sprint 2.5 enligt strategi 2026-04-23 |
| Sprint 3 — P5 | ⏳ Väntar | Inera-stack |
| Sprint 4 — P6 | ⏳ Väntar | Lakehouse + OMOP |
| Sprint 5 — P7 | ⏳ Väntar | CDS-regler i CQL |
| `1.0.0` RC | ⏳ Väntar | Efter Sprint 5 |

Den här tabellen uppdateras när sprintar startas och avslutas. Detaljerad
sprint-status och Sprint 2-fasindelning underhålls i
`nimloth-docs/Strategi_Nasta_Steg.md` (utanför repot).

---

## 11. Beslutsloggar

Stora arkitekturbeslut och prioriteringsskiften dokumenteras här med datum och motivering.

### 2026-04-22 — Fork från VGR Datahub (→ Nimloth Flow + Nimloth Core)

Beslut att dela upp den ursprungliga PoC:n i två parallella produkter:

- **VGR Datahub → Nimloth Flow** (stabiliserad integrationsmotor)
- **Ny fork → Nimloth Core** (full plattform under aktiv utveckling)

Motivering: de sju planerade utbyggnads­prompterna (P1–P7) förändrar kärnkaraktären i ursprungskoden — från integration till plattform. Att hålla bägge i samma repo skulle resultera i en otymplig hybrid. Två produkter, två repon, två CI-pipelines ger klarhet och möjlighet till independent release cycles.

Dokumenterat i `Forkplan_Nimloth_Core_och_Flow.md`.

### 2026-04-22 — Roadmap Sprint 1-5 antagen

Prioritering: Terminologi + Care-unit-edge först (Sprint 1), öppnEHR + AI-mapping (Sprint 2), Inera (Sprint 3), Lakehouse (Sprint 4), CDS-CQL (Sprint 5).

Motivering enligt `VGR_Datahub_Utbyggnadsplan.md`: Sprint 1 har låg risk och hög demo-effekt. Sprint 2 är arkitekturell tung lyftning men måste göras innan övriga spår bygger vidare. Sprint 3 gör plattformen trovärdig för säkerhetsarkitekter. Sprint 4 öppnar för forsknings- och EHDS-argument. Sprint 5 positionerar CDS för framtiden utan att bryta nuvarande.

### 2026-04-23 — Sprint 2.5 etablerad

Mapping-assistant (P4) lyft från Sprint 2 till egen Sprint 2.5. Skäl: P3-spåret (openEHR) är tyngre än ursprungligen tänkt — fyra-nivåers toolchain (compiler-container → runtime-tjänst → dashboard-editor → ev. JS-native) etablerad enligt `nimloth-docs/Strategi_Nasta_Steg.md` sektion 4.1. Att försöka leverera båda P3 och P4 i samma sprint riskerar att P4 blir halvfärdig och stör openEHR-fundamentet. Sprint 2.5 körs efter Sprint 2-leverans.

### 2026-04-27 — P3.0 levererad som pivot C

P3.0 (compiler foundation) levererad efter SDK-undersökning. Out-of-the-box AOM→XML-OPT-bridge finns inte i archie 3.14.0 eller `org.ehrbase.openehr.sdk:opt-1.4` — pivot till "diagnostic compiler + fixture-baserad EHRbase-load". XML-OPT-arbetet lyft till uppföljnings-prompt P3.0b. Strategiska frågor om CKM-licens (CC-BY-SA 3.0) identifierade — research planeras parallellt.

Se `infra/openehr/compiler/PHASE-3.0-REPORT.md`.

### 2026-04-28 — P3.1 levererad, P3.0b empiriskt scopad

Composer-foundation klar med 6 nya CKM-arketyper och fixture-baserade compositions (4 av 7 Fru Andersson-event-typer fungerar end-to-end). 8 nya smoke-tester, 12 befintliga fortfarande gröna. CI-terminology-fail rättad parallellt (pre-existing från Sprint 1).

P3.0b empiriskt scopad till **13 RM-typer** (var 30 i P3.0-rapporten) baserat på constraint-data från `gap-tracker`. EVALUATION-bridge bör prioriteras eftersom 3 av 7 event-typer (medication, allergi, diagnos) är blockerade tills den är på plats.

Se `infra/openehr/compiler/P3.1-REPORT.md` sektion "Input till P3.0b".

### 2026-05-28 — SDG → AI-beredskaps-spåret (Fas 1–3) levererat

Ett parallellt arbetsspår (utanför P1–P7-numreringen, detaljplanerat i
`nimloth-docs/`) landade i tre faser och bevisar bokens tes "plattform =
AI-beredskap":

- **Fas 1 (SDG-10):** migrerade syntetisk-data-generatorn från fixture-shapes till
  äkta domän-OPTs (lab/medication/diagnos/adverse). 1005 EHR i EHRbase på cf4.
  E11-normalisering av diabetes_typ2-profilen. (Övriga profil-taggar → ICD ännu
  ej normaliserade — spårat öppet, se `memory/`.)
- **Fas 2:** `aql-template-service` (Kontrakt 1) — ärliga SDG-frågor som
  parametriserade mallar, S4-validator + tier-gräns. Co-lokaliserad på cf4
  (:11402, intern). + dashboard-trendkomponent + `/compose-demo`-sandlåda.
- **Fas 3 (Fork 4):** `med-review` AI-medicineringsgenomgång — deterministiska
  regelmotorer (klinisk bedömning, S1-ryggrad) + Claude-syntes med
  output-validering (LLM ur beslutsvägen, *verifierad* ej prompt-beroende).
  Co-lokaliserad på cf4 (:11403, intern). `/med-review`-vy.

**Demo-yta publik (Access-gated):** demo-ytan `nimloth-demo` är publikt tunnlad på
`nimloth-demo.carlius.net` **bakom Cloudflare Access (Zero Trust)** — backend-tjänsterna
(11402/11403) förblir interna. mock-auth-skulden är därmed *mitigerad av Access, inte
löst* (publik utan Access kräver fortfarande att den åtgärdas).

**Öppna punkter:** mock-auth (för publik exponering utan Access-lager); exakta
Beers/STOPP-kriterie-ID:n utestående (sektion+DOI shippad). Detaljerade beslut +
körnings-lärdomar i `memory/` (MEMORY.md-index).

---

## 12. Referenser

- [`README.md`](../README.md) — produktöversikt
- [`docs/POSITIONING.md`](POSITIONING.md) — Nimloth-familjens struktur
- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) — målbild och lagerkontrakt
- [`docs/prompts/`](prompts/) — utbyggnadsprompter P1–P7
- `Forkplan_Nimloth_Core_och_Flow.md` — hur forken genomfördes
- `VGR_Datahub_Utbyggnadsplan.md` — arkitekturell rationale för P1–P7
- Artikelserien *Nästa generations journalsystem* — arkitektoniskt fundament

# Pre-public-demo-checklista

**Status:** Referens-dokument
**Datum:** 2026-05-03
**Syfte:** Vad som måste vara på plats innan Nimloth Core exponeras externt — på vilken nivå.

Detta är **inte** en aktiv to-do-lista. Det är referens när vi börjar prata externt.

---

## 1. Demo-scope-frågan måste besvaras först

Tre realistiska demo-typer. Krav-nivå skiljer sig dramatiskt.

| Demo-typ | Vem ser det | Krav-nivå | Tidigast realistiskt |
|---|---|---|---|
| **Intressent-demo med fixture-data** (Fru Andersson + ev. fler syntetpatienter) | Investerare, tech-partners, annan region. Ingen real-PNR exponering. | Auth + TLS + nätverkssegmentering. Watermark "DEMO ENVIRONMENT". Hårdkodad åtkomstkrets. | Efter Sprint 3 P5 (auth-stacken finns) |
| **Pilot mot real-vårddata** med en avtalad partner | En region eller vårdcentral. Kontrollerad användarkrets med riktig SITHS-cert-auth. | Hela Pre-launch-hårda-krav-listan (sektion 2). PUB-avtal. Juridisk OK från CISO/DPO. | Efter Sprint 3 fullt + sannolikt Sprint 5 stabilisering |
| **Public-facing platform** | Vem som helst med URL. | Hela listan + EHDS-compliance-audit + lasttest + DR-plan testad + sekrets-vault. | Post-1.0-RC |

Demo-scope avgör allt nedan. Frågan "är vi redo att gå publikt?" har inget svar utan scope.

---

## 2. Hårda krav (Pre-launch — alla tre demo-typer)

Detta är saker som **inte får exponeras externt** utan adressering. Ingen av dem är gjord per 2026-05-03.

### 2.1 Riktig auth (idag dev-stub)

`services/fhir-facade/src/middleware/auth.ts` är dev-stub som behandlar Bearer-tokens som HSA-ID rakt av. Dev-default `SE-DEV-ANONYMOUS`.

**Krav:** SITHS-cert-baserad auth (Sprint 3 P5) eller minimum JWT mot Keycloak (containern finns redan i `docker-compose.yml`).

### 2.2 PDL_ENFORCE=true (idag default false)

`server.ts:102` — `pdlMiddleware(deps.pool, { enforce: deps.pdlEnforce ?? false })`.

**Krav:** Default-byte till `true` i prod. Plus riktig vårdrelations-databas (Sprint 3 P5 levererar PDL-decision-service).

### 2.3 TLS överallt

Idag `http://`. Inga cert-pinningar, inga ACME, inga CSP-headers.

**Krav:** Reverse-proxy med Let's Encrypt eller Cloudflare Tunnel (per `userMemories`). HSTS-headers. CSP-headers på dashboard.

### 2.4 Nätverkssegmentering

`docker-compose.override.yml` exporterar `core-db:5432` på host-port `10435`, samma för Kafka, EHRbase. Override.yml är dev-only men måste inte gälla i prod.

**Krav:** Inga host-port-exports utöver fhir-facade + dashboard. Internt docker-network för allt annat.

### 2.5 Riktiga credentials via secrets

Idag `core/core` för alla DBs, `ehrbase-user/ehrbase-password`, etc. i `.env`-filer.

**Krav:** Sekrets-vault eller managed identity. Random-generated på bootstrap.

### 2.6 Backups med dokumenterad recovery

Inga schemalagda backups idag. Synology kan ha snapshots men inte verifierat database-aware.

**Krav:** Schemalagd `pg_dump` (eller WAL-streaming) till offsite. Recovery-test minst kvartalsvis.

### 2.7 PNR-pseudonymisering i audit-logg (eller juridisk OK)

`audit_log.patient_personnummer` är klartext. Följer med i exporter, backuper, lakehouse-zoner.

**Krav:** Pseudonymisering med per-instans-salt eller secure-enclave reverse-lookup. Eller: juridisk OK från DPO på klartext-PNR i audit (svår att få).

### 2.8 CKM CC-BY-SA 3.0-licens-juridik klargjord

ADL-arketyper är CC-BY-SA 3.0. Distribuerar Nimloth Core kommersiellt eller skapar fork-derivat → share-alike kan tvinga öppen kod.

**Krav:** Juridiskt råd. Strategi 8.2 har detta som kritisk pre-1.0-RC-fråga. Strategi 12.1 listar det som utelämnad uppdateringskö-item.

---

## 3. Starkt rekommenderat (Pre-launch — pilot + public)

Inte hårda blockerare för intressent-demo, men måste vara på plats för pilot+public.

| # | Krav | Konsekvens om utelämnat |
|---|---|---|
| 3.1 | Rate-limiting + DDoS-skydd (Cloudflare täcker delvis) | Trivial DoS-yta, ej acceptabelt för publik |
| 3.2 | Sprint 2.5 B6 — per-användar PDL-attribution för dashboard | Dashboard-användare ej spårbara individuellt; audit blir ihåligt |
| 3.3 | Sprint 2.5 B10 — kanonisk konvention för event-fält | Latent skuld; fler producenter förvärrar |
| 3.4 | P3.0b avslutad (alla EVALUATION-arketyper) | ParityTrend visar inkomplett bild för intressenter |
| 3.5 | Disaster recovery-plan dokumenterad och testad | RTO/RPO odefinierat; vid incident: rekonstruktion under press |
| 3.6 | Sekrets-vault istället för `.env`-filer | Sekrets i klartext på disk; rotation manuell |
| 3.7 | Central log-aggregering (Loki/Elasticsearch/CloudWatch) | Felsökning kräver `docker compose logs` per service; cross-service-felsökning omöjlig |
| 3.8 | Health-monitoring + alerting (Prometheus + Grafana) | Failures upptäcks av slump, inte proaktivt |
| 3.9 | Real migrations-toolchain (node-pg-migrate eller motsv.) | Idag fil-närvaro-baserade migrations; rollbacks omöjliga |

---

## 4. Post-launch löpande

| # | Krav | När |
|---|---|---|
| 4.1 | Lasttester (K6 eller Artillery) i CI | Innan pilot går till >10 användare |
| 4.2 | EHDS-compliance-audit kontinuerligt | Mot EU-deadline 2027-2028 |
| 4.3 | Schema Registry för Kafka-events (Avro) | När 3+ producent-källor finns (Sprint 3 introducerar ≥2 nya) |
| 4.4 | Feature-flag-yta för gradvis rollout | När >1 deploy-target finns |
| 4.5 | i18n om EU-marknad blir aktuell | Marknadsbeslut |
| 4.6 | Audit-event signaturer (immutable audit-log) | EHDS-tvingande senast pre-1.0 |
| 4.7 | Multi-tenant-arkitektur | Strategi 8.3 — post-1.0 |

---

## 5. Vad varje demo-typ MÅSTE innehålla för att vara värt att visa

Demo-värdet definieras av vilka av Nimloth Core's tesar som syns:

| Feature / Tes | Intressent-demo | Pilot | Public |
|---|:---:|:---:|:---:|
| **Fru Andersson via dual-store** + ParityTrend (P3.3 + P3.4) | ✓ | ✓ | ✓ |
| **openEHR-spår komplett** (P3.0b alla EVALUATION-arketyper) | ✓ | ✓ | ✓ |
| **Audit-spår synligt** med PARITY_RUN/BRIDGE_*-events | ✓ | ✓ | ✓ |
| **Mapping-assistant-flöde** (Sprint 2.5 P4) — AI som föreslår mappningar | (önskvärt) | ✓ | ✓ |
| **Distribuerad edge-arkitektur** (Sprint 1 P2 redan klart, demos via `--distributed`) | ✓ | ✓ | ✓ |
| **Inera-integration** (Sprint 3 P5) | — | ✓ | ✓ |
| **Multi-patient** (inte bara Fru Andersson) | (önskvärt) | ✓ | ✓ |
| **CDS-hooks-card-demonstration** | (önskvärt) | ✓ | ✓ |
| **Lakehouse / OMOP-export** (Sprint 4 P6) | — | (önskvärt) | ✓ |
| **CDS i CQL** (Sprint 5 P7) | — | — | (önskvärt) |

**Kritisk insikt:** Nimloth Core's distinktion är **AI-tesen i kod** (Mapping-assistant) + **öppna kanoniska modeller** (openEHR via fungerande broker). Demo som bara visar FHIR-router missar poängen — det finns redan 50+ FHIR-routers i marknaden. Mapping-assistant + ParityTrend är det visuella beviset på Nimloth-tesen.

---

## 6. När någon frågar "är vi redo att gå publikt?"

Steg-för-steg-svar:

1. **Vilken demo-typ?** Avgör krav-omfattning.
2. **Är hårda kraven (sektion 2) adresserade?** Om nej: ingen exponering förrän.
3. **För pilot/public: är starkt rekommenderat (sektion 3) adresserat?** Om nej: dokumentera risk + plan.
4. **Visar demot Nimloth-tesen (sektion 5)?** Om nej: demot saknar poäng oavsett om tekniken funkar.

Vid alla tre svar "ja": redo. Vid något "nej": dokumentera vad som saknas innan beslut.

---

## 7. Senast uppdaterad

| Datum | Ändring |
|---|---|
| 2026-05-03 | Initial version efter Sprint 2.5-leverans. Skapad som referens-dokument under "alt 3-bygge"-session. |

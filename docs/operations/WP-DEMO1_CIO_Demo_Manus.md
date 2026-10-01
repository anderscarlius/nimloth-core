# WP-DEMO1 — CIO-demo (unified stack, ≤30 min)

**Publik:** regional CIO / IT-chef (strategisk, inte djup openEHR-kurs).  
**Data:** 100 % syntetisk — Fru Andersson `19500315-2384`.  
**Förberedelse:** `./deploy/demo-slice/up-local-unified.sh` (eller `./scripts/start.sh` + bevis-skript).  
**Portar:** dashboard `:3010`, FHIR `:3003`, Kafka UI `:8080` (lokal laptop).

> **Isärtagning:** Iceberg/lakehouse Bronze är **medvetet bort** i denna demo (**2026-10-01**).
> Säg det högt när du visar arkitekturbilden — analytics-lagret är roadmap P6, inte påstått live.

---

## Pre-flight (10 min före)

- [ ] `./deploy/demo-slice/run-stack-health-check.sh` grön
- [ ] `./deploy/demo-slice/run-aql-fhir-vitals-proof.sh` grön (AQL ↔ FHIR-bevis)
- [ ] Browser: dashboard `http://localhost:3010`, Kafka UI `http://localhost:8080`
- [ ] `./scripts/demo-fru-andersson.sh` en gång (verifiera FHIR/CDS)

---

## 00:00 — Hook (2 min)

**Säg:** Nimloth är en modulär svensk e-hälsa-referens: openEHR internt, FHIR utåt,
händelser i mitten — inte en monolit som påstår mer än den kör. Idag kör vi en
**begränsad men ärlig** unified slice på syntetisk data.

---

## 02:00 — Arkitektur på 90 sekunder (3 min)

**Visa:** `docs/ARCHITECTURE.md` lagerdiagram (eller dashboard topologi om distribuerat läge inte behövs).

**Säg (kort):**

1. Källsystem simuleras (Melior/Asynja Postgres).
2. CDC → Kafka → transform → domän-events.
3. **EHRbase** (openEHR) + **FHIR-fasad** (konsumtion).
4. Dashboard för klinisk vy.

**Ärlighets-beat:** Lakehouse Bronze/Iceberg — *planerat*, inte i dagens compose.

---

## 05:00 — Event-path live (5 min)

**Visa:** Kafka UI → topic `core.clinical.observation.vitals` (eller `core.clinical.*`).

**Säg:** När käll-DB ändras fångar Debezium det; transform mappar till kanoniska
events; både openEHR-composer och FHIR-materializer kan reagera på samma bus.

**Valfritt terminal:** `./scripts/simulate-emergency.sh` → ny observation → refresh dashboard Vitala-flik.

---

## 10:00 — openEHR + FHIR samma observation (5 min)

**Terminal (redan kört — visa utskrift eller kör om):**

```bash
./deploy/demo-slice/run-aql-fhir-vitals-proof.sh
```

**Säg:** Samma numeriska vital läses via **AQL** i EHRbase och via **FHIR R4 GET** —
det bevisar att de två ytorna inte lever i parallella fantasivärldar.

**Visa FHIR i browser (med dev-headers om behövs):**

`http://localhost:3003/fhir/r4/Observation?patient=19500315-2384`

---

## 15:00 — Klinisk yta: Fru Andersson (8 min)

**Kör eller visa:** `./scripts/demo-fru-andersson.sh` (FHIR patient, `$everything`, CDS, audit).

**Dashboard:** Patientsök `19500315-2384` — banner, allergi, CDS-kort, läkemedel.

**Säg:** Det här är samma kodbas som kan deployas i slices (Eldar EHRbase `:18124` idag;
full unified på server är nästa steg — inte påstått i nattens deploy).

---

## 23:00 — Styrning & nästa steg (4 min)

**Säg:**

- B4-strangler (migration-gateway) finns som **separat** CI-bevis — inte samma UI, samma disciplin.
- Keycloak/IN2 (`AUTH_MODE=dev` lokalt) — produktionssäker auth är på väg, demo kör dev-stub.
- Nästa investering: Eldar unified overlay (Kafka + FHIR host-portar enligt portstrategi), sedan lakehouse Bronze.

---

## 27:00 — Frågor (3 min)

**Ha redo:**

- Portar Eldar: EHRbase **18124** (`deploy/core-slice/README.md`).
- Vad som **inte** ingår: prod-data, Better-klon, OMOP Gold, Iceberg (2026-10-01).

---

## Referenser

- [deploy/demo-slice/RUNBOOK.md](../../deploy/demo-slice/RUNBOOK.md)
- [QUICKDEMO.md](../QUICKDEMO.md)
- [demo_manuscript.md](../demo_manuscript.md) (Atlas + med-review — annat spår)

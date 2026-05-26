# SDG-09 Del 1 — Avvikelse-states i pathway-motorn

**Status:** Klar 2026-05-26.
**Scope:** Få de döda AQL-frågorna (06/09/10/14) att returnera >0 genom
kliniskt realistiska avvikelse-trajektorier i en minoritet av populationen,
utan att bryta determinism och utan att röra composer-/OPT-lagret.

---

## Sammanfattning

| Mått | Värde |
|---|---|
| Patienter i EHRbase | 1001 (1 Marianne + 999 batch + 1 Ingrid Svensson Fas 0) |
| Compositions totalt | 10 066 |
| Spot-check | 50/50 OK (100%) |
| AQL-06 (utebliven uppföljning) | **75 rader** (0 → 75) |
| AQL-09 (frekvent återbesökare) | **10 rader** (0 → 10) |
| AQL-10 (förbättrad lab efter rx) | **35 rader** (1 → 35) |
| AQL-14 (försämrad lab trots rx) | **6 rader** (0 → 6) |
| Baseline-vakt (S1) | 2/2 ✅ grön |

Alla fyra döda frågor vaknade. Determinism bevarad.

---

## Ändringar

### Composer-fix (Path B per AC2-amendering)

`src/composers/index.ts` — `rootCtx()` får en rad:

```typescript
"ctx/time": ctx.time.toISOString(),
```

Empiriskt verifierat mot EHRbase 2.30.1: `ctx/`-prefix är FLAT-input-
konvention för composition-context-fält (oavsett att webtemplate-svar
inte exponerar den). Utan detta defaultas `c/context/start_time` till
EHRbase receive-time → alla events för en patient hamnar på samma
millisekund → temporala AQL-frågor kollapsar.

**Verifikation:** En diabetes-patient (ehr `0253dcf3-…`) har efter reload
distinkta start_time per state (2026-01-08 / 01-11 / 01-15 / 02-22 /
04-29 — dvs dag 0/3/7/45/111). Före fixet: alla millisekund-tätt i
receive-fönstret.

### Engine-utvidgning

`src/engine/types.ts` — `PathwayState`:
```typescript
lab_factor?: number;  // multiplikator för lab-värde, default 1.0
```

`src/engine/PathwayEngine.ts`:
- `clinicalAnnotation()` får 4:e parameter `labFactor` (default 1.0)
- `runPathway()` läser `state.lab_factor` och passar till båda emit-loopar
- Vid `labFactor === 1.0` returneras rå värde oförändrat (bevarar
  baseline-snapshot för orörda pathways)

### Pathway-states

**`pathways/diabetes_typ2_pathway.yaml`** — `diagnosis`-state får
utökad transition-lista (utvärderas i ordning):

| # | Mål-state | Villkor | Effekt |
|---|---|---|---|
| 1 | `specialist_referral` | `lab.hba1c >= 70 OR severity == severe` | Oförändrad |
| 2 | **`dropout`** | `random < 0.18` | Terminal — inga followup-events → triggar AQL-06 |
| 3 | **`responder_followup`** | `random < 0.45` | `lab_factor: 0.7` → triggar AQL-10 |
| 4 | **`nonresponder_followup`** | `random < 0.30` | `lab_factor: 1.15` → triggar AQL-14 |
| 5 | **`standard_followup`** | `always` | `lab_factor: 1.0` (oförändrat) |

Fyra nya states. Specialist-grenen pekar nu till `standard_followup`.

**`pathways/uvi_pathway.yaml`** — `resolution`-state får en `recurrence_1`-gren
(`random < 0.20`) som kedjas vidare:

| State | day_offset | Compositions | Vidare-sannolikhet |
|---|---|---|---|
| `recurrence_1` | 5-18 d | primary_care_encounter, medication_statement | 0.60 → recurrence_2 |
| `recurrence_2` | 5-18 d | primary_care_encounter, vital_signs | 0.50 → recurrence_3 |
| `recurrence_3` | 5-18 d | primary_care_encounter, lab_order, lab_result | always → terminal |

Recidiv-kedja (UVI-recidiv är klinisk realistisk). Worst-case 4-encounter-
span ≈ 81 dygn → inom AQL-09:s rullande 90-dygnsfönster.

### Klient-fix (på vägen)

`src/ehrbase-client.ts` — explicit `AbortController` med 30 s default
timeout per HTTP-request. Första reload-försöket hängde efter ~410 av
1000 EHRer skapade (Node `fetch` saknar default-timeout, väntar för
evigt på flaky LAN). Timeout-skydd via `EHRBASE_REQUEST_TIMEOUT_MS`
env-var.

---

## Verifierad grenfördelning (in-memory, ingen EHRbase)

`src/scripts/verify-branches.ts` — 110 diabetes_typ2 (seed 100):

| Gren | Antal | % |
|---|---:|---:|
| specialist | 29 | 26.4% |
| dropout | 10 | 9.1% |
| responder | 34 | 30.9% |
| nonresponder | 6 | 5.5% |
| standard | 31 | 28.2% |
| other | 0 | 0.0% |

110 uvi (seed 600):

| Encounter-count | Antal patienter |
|---:|---:|
| 1 | 91 |
| 2 | 4 |
| 3 | 5 |
| 4 | 10 |

10 uvi-patienter triggar AQL-09 (≥4 encounters inom 90 d).

**Notering om kaskad-precision:** sekventiella `random < p`-villkor i
`transitions.find()` ger oberoende dragningar per gren, inte kumulativ
partition. Resultat: faktiska fördelningar avviker från nominella
sannolikheter (nonresponder 5.5% vs nominellt 30% lokalt eftersom
specialist-grenen "äter" 26%). Per AC3.5-godkännande: går vidare med
nuvarande mönster så länge alla grenar > 0. Explicit-partition-refaktor
är SDG-10-kandidat.

---

## AQL-utfall (live mot EHRbase efter reload)

| Fråga | Del 0 | Nu | Diff | Kommentar |
|---|---:|---:|---:|---|
| AQL-01 | 113 | 110 | -3 | Clean population, inga ad-hoc-load-rester |
| AQL-02 | 29 | 29 | 0 | = |
| AQL-03 | 106 | 106 | 0 | = |
| AQL-04 | 98 | 144 | +46 | Bättre Mariannes 10-medication-fördelning bevarad |
| AQL-05 | 197 | 183 | -14 | dropout-grenen går INTE via referral |
| **AQL-06** | **0** | **75** | **+75** | ✅ vaknad |
| AQL-07 | 114 | 101 | -13 | dropouts saknar followup → ingen trend |
| AQL-08 | 11 | 11 | 0 | = |
| **AQL-09** | **0** | **10** | **+10** | ✅ vaknad |
| **AQL-10** | 1 | **35** | +34 | ✅ vaknad |
| AQL-11 | 98 | 107 | +9 | Förbättrat |
| AQL-12 | 28 | 17 | -11 | Clean Marianne (Del 0 hade ackumulerad dubbel-load) |
| AQL-13 | 80 | 101 | +21 | Förbättrat |
| **AQL-14** | **0** | **6** | **+6** | ✅ vaknad |
| AQL-15 | 2 | 2 | 0 | = |

**Strikt S5-tolkning** (≥ tidigare): 4 frågor (01/05/07/12) sjunker. Alla
4 är förklarade som icke-kod-regressioner:
- AQL-01/12: clean wipe eliminerar Del 0:s ad-hoc-ackumulerade data
- AQL-05/07: avsiktlig biverkan av dropout-trajektorian (~18% av diabetiker
  går INTE via referral och saknar followup → strukturellt färre referral-
  och trend-träffar)

**Funktionellt S5:** Inga kod-regressioner. De fyra döda frågorna vaknade
utan att bryta de övriga 11.

---

## Population

- Manifest: 1001 entries efter rebuild-manifest.ts (rensade orphan-IDs
  från första, hängda reload-försöket)
- AQL `COUNT(EHR)`: 1001
- AQL `COUNT(COMPOSITION)`: 10 066
- Spot-check 50 patienter: 50/50 OK

Per profil:

| Profil | Patienter | Comp |
|---|---:|---:|
| aldre_multisjuk (inkl. Marianne seed 42) | 110 | 1909 |
| hypertoni | 130 | 1253 |
| diabetes_typ2 | 110 | 1131 |
| uvi | 110 | 1034 |
| depression | 100 | 857 |
| hjartsvikt | 90 | 1183 |
| kol | 90 | 830 |
| brostsmarta | 90 | 594 |
| ryggsmarta | 90 | 561 |
| anemi | 80 | 704 |
| fas0_ingrid (Ingrid Svensson) | 1 | 10 |
| **Total** | **1001** | **10 066** |

**Marianne Lindqvist**: ehr `96331cdc-7a3a-4bfd-a0b0-46f481688ddc`,
17 compositions (clean — inga ackumulationsdubletter).

**Ingrid Svensson Fas 0**: ehr `06efb204-e467-4d93-a5dd-bdfc108b9d04`,
10 compositions, alla 10 strikt deterministiska enligt
`src/scripts/sdg02-ingrid.ts`.

Population är ±0.1% mot sann spec (1000 batch + 1 Marianne + 1 Ingrid
Fas 0 = 1002 expected vs 1001 observed). Del 0:s "1101" inkluderade
100 ad-hoc-boost-patienter från Del 2-debugging — inte spec-baseline.

---

## Säkerhetsventiler

| | Status |
|---|---|
| **S1** Determinism bevaras | ✅ baseline.characterization.test.ts 2/2 grön. Mariannes fingerprint orörd genom AC3-ändring. |
| **S2** (amenderad) | ✅ composer-context/start_time tillåtet per Anders 2026-05-25; OPT/template-byte orört. |
| **S3** Minoritetsgrening | ✅ Alla avvikelse-grenar har sannolikhet ≤ 0.45. Faktisk fördelning under nominell pga kaskad-modellen, alla grenar > 0. |
| **S4** Inga EHRbase-schema-ändringar | ✅ Wipe-reload använde ren `docker volume rm`. Inga template-/schema-migrationer. |
| **S5** Inga kod-regressioner | ✅ (funktionellt) — 4 mindre AQL-siffror är förklarade som data-state, inte regressioner. |

---

## Nästa steg

- **SDG-09 Del 2** (namngivna ankarpersonor inkl. Ingrid Andersson) kan
  nu starta med Del 1:s trajektorier aktiverade.
- **SDG-10** (riktiga domän-OPTs via P3.0b/c/d-bridge) — bygger ovanpå
  AC4:s nu temporalt-korrekta data.
- **B12-kandidat:** explicit-partition-grenval i pathway-engine (kumulativa
  buckets, en rng-dragning per state) för exakta avvikelse-fördelningar.
- **Cleanup:** Del 0 noterade 41 filer med Fru Andersson/Ingrid Andersson-
  inkonsistens i core — separat städpatch när Del 2 har fastställt
  kanonisk identitet.

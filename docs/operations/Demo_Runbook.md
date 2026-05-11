# Demo Runbook — composition-mapper på CarliusFyra

**Status:** Operativ demo-guide för P4-leverans
**Senast uppdaterad:** 2026-05-11
**Demo-instans:** `http://192.168.1.189:11102`
**Publik:** Regional CIO, klinisk-informatik, beslutsfattare
**Komplement:** [`Human_Review_Demo_Talking_Points.md`](Human_Review_Demo_Talking_Points.md)
**Versionerat:** ja (i nimloth-core).

---

## 1. Pre-demo-checklist (kvällen innan eller 1h innan)

### 1.1 Demo-instans uppe?

```bash
curl -sf http://192.168.1.189:11102/health | jq .
```

Förväntat:
```json
{
  "status": "ok",
  "service": "composition-mapper",
  "dataMode": "synthetic",
  "audit": { "disabled": true, ... }
}
```

Om något annat → se §6 Troubleshooting.

### 1.2 Anthropic-routning fungerar?

```bash
cd <nimloth-core-rotkatalog>
curl -sf -X POST http://192.168.1.189:11102/api/v1/map/medication-statement \
  -H "Content-Type: application/json" \
  -d @docs/operations/demo-fixtures/waran-basic.json | jq '.aggregateConfidence'
```

Förväntat: `0.9` eller högre inom 5-10s.

### 1.3 Anthropic-kreditbalans

Logga in på `console.anthropic.com` och kontrollera kvarvarande credit.

**Demo-cost-uppskattning:** 5-10 anrop × ~$0.02 per anrop = $0.10-0.20 per
demo-session. $5 i balans räcker för många demos.

### 1.4 nimloth-docs co-existerar (port 11551)

```bash
curl -sf http://192.168.1.189:11551/ | head -5
```

Inte demo-kritiskt men inkonsekvens om den ligger nere.

### 1.5 Backup-strategi om CarliusFyra brister

Om live-demo inte fungerar:
1. Visa eval-rapporten direkt — den är cachead lokalt i
   `services/composition-mapper/eval-set/reports/`
2. Visa commit-historik som bevis på arbete: `git log --oneline | head -15`
3. Visa P4-spec sektion 14 i `nimloth-docs/P4_Composition_Mapper.md`

---

## 2. Access-vägar för demo

Tre möjliga sätt att nå composition-mapper-instansen under inspelning eller live-demo. Välj per situation.

### 2.1 LAN direkt (för demo hemma)

```bash
curl -X POST http://192.168.1.189:11102/api/v1/map/medication-statement \
  -H "Content-Type: application/json" \
  -d @docs/operations/demo-fixtures/waran-basic.json | jq
```

Funkar när du sitter på samma nät som CarliusFyra. Visar intern IP `192.168.1.189` på skärm — välj annan väg för publik video där intern infrastruktur inte ska synas.

### 2.2 SSH port-forward (default-rekommendation för video)

```bash
# Terminal 1 — håll öppen under hela inspelningen:
ssh -L 11102:localhost:11102 SkyttenAdmin@192.168.1.189

# Terminal 2 — för POST-anropen:
curl -X POST http://localhost:11102/api/v1/map/medication-statement \
  -H "Content-Type: application/json" \
  -d @docs/operations/demo-fixtures/waran-basic.json | jq
```

Visar `localhost:11102` på skärm istället för intern IP. Default-val för publika videor.

### 2.3 Cloudflare-tunnel (`nimloth.carlius.net`)

Cloudflare-tunnel är konfigurerad för `nimloth.carlius.net`, men skyddas av **Cloudflare Zero Trust Access** (MFA + whitelisted emails per `carlius.net`-tunnel-policy). Curl utan auth-cookie returnerar `HTTP 302 → carlius.cloudflareaccess.com/cdn-cgi/access/login/...`.

För publik demo-video utan auth-flöde fungerar inte tunneln direkt. Två sätt att aktivera:

1. **Browser med inloggad Cloudflare Access session** — Anders själv kan navigera direkt. Risk: MFA-login syns i video om någon annan tittar.
2. **Service-token (för automation)** — kräver separat setup via Cloudflare-dashboard, headers `CF-Access-Client-Id` + `CF-Access-Client-Secret` med varje request.

Cloudflare-tunnel ej aktiverad mot 11102 för opanyad demo-curl i nuläget. Behåll SSH port-forward som default. Eventuell setup av service-token är öppen punkt, åtgärdas separat.

---

## 3. Demo-flöde (förslag, ~15 min)

### Steg 1 — Architecture overview (~3 min)

[Slide eller whiteboard]

Tre punkter att etablera:
1. **Två-lager-mappning:** deterministisk (klar logik, 100% confidence) +
   LLM-assisterad (fritext-tolkning, 0-1 confidence).
2. **Aggregator med review-pathway:** systemet ger inte falska svar — det
   säger "jag vet inte" när osäkerheten är för hög, och vilket fält osäkerheten
   gäller.
3. **Sensitivity-tier i model-router:** PHI är hard-låst till on-premise,
   synthetic-data tillåter cloud (det är vad demo använder).

### Steg 2 — Input-FHIR (~2 min)

Visa råinput från eval-set:

```bash
cat services/composition-mapper/eval-set/med-001.json | jq '{
  id,
  input: .input_fhir,
  notes: .metadata.notes
}'
```

**Talking point:** "Detta är ett typiskt FHIR-paket från ett källsystem som
Melior. Vi tar emot det och måste mappa det till en strukturerad openEHR-
composition som passar regionens semantik."

### Steg 3 — Live API-call (happy path) (~3 min)

```bash
curl -X POST http://192.168.1.189:11102/api/v1/map/medication-statement \
  -H "Content-Type: application/json" \
  -d @docs/operations/demo-fixtures/waran-basic.json | jq .
```

Förväntat (visa skärmen för publiken):
- `status: "complete"`
- `aggregateConfidence: 0.99`
- `composition` med 6 fält (medicationName, status, startTime, route, subject,
  doseQuantity, frequency)
- `fieldEvidence`-array som visar varje fält + dess källa (`deterministic` eller
  `llm`) + confidence per fält

**Talking point:** "Detta är ett enkelt fall — vi får komplett mappning på 5
sekunder. Notera `fieldEvidence`-arrayen: jag kan visa exakt vilket fält
modellen tolkade, vad den var säker på, och varför."

### Steg 4 — LLM-tolkning av fritext-dosering (~3 min)

```bash
curl -X POST http://192.168.1.189:11102/api/v1/map/medication-statement \
  -H "Content-Type: application/json" \
  -d @docs/operations/demo-fixtures/metformin-freetext.json | jq .
```

Förväntat:
- `composition.doseQuantity.value` → `{value: 500, unit: "mg"}`
- `composition.frequency.value` → `"BID"` (två gånger om dagen)

**Talking point:** "Här tolkade vi 'två gånger om dagen i samband med måltid' →
struktur. Det är LLM-arbetet. Den deterministiska delen klarar inte fritext."

### Steg 5 — Review-pathway demonstration (~3 min)

```bash
curl -X POST http://192.168.1.189:11102/api/v1/map/medication-statement \
  -H "Content-Type: application/json" \
  -d @docs/operations/demo-fixtures/ambiguous-dosage.json | jq .
```

Förväntat:
- `status: "human-review-required"`
- `reviewPayload.triggerReason: "low_confidence"`
- `aggregateConfidence: 0`

**Talking point:** "Här hade vi tvetydig text — 'individanpassad dos enligt
INR-värde'. Systemet hittar inte en numerisk dos och säger explicit 'jag vet
inte'. `reviewPayload` ger en kliniker exakt information om vad som behöver
granskas. Detta är inte ett fel — det är önskat beteende för säker mappning."

### Steg 6 — Mätningar (~1 min)

```bash
LATEST=$(ls -t services/composition-mapper/eval-set/reports/*-all.json | head -1)
jq '{
  field_accuracy: .fieldAccuracy,
  review_recall: .reviewRecall,
  false_positive_rate: .falsePositiveReviewRate,
  total_pairs: .totalPairs,
  mean_latency_ms: .meanElapsedMs
}' "$LATEST"
```

**Talking point:** "På 50 syntetiska testpar når vi 98.9% field-accuracy och
3% false-positive-review-rate. Review-recall är 64.7% vilket är under vårt mål
om 95% — vi har identifierat detta som arkitekturskuld (multi-dosering, multi-
route, temporal inkonsekvens) och dokumenterat det som Sprint 3-arbete. Inget
är gömt."

---

## 4. Demo-fixtures

Tre fixtures i `docs/operations/demo-fixtures/`:

| Fixture | Demo-syfte | Förväntat resultat |
|---|---|---|
| `waran-basic.json` | Happy path — strukturerad dos + frekvens | `status: complete`, conf 0.99 |
| `metformin-freetext.json` | LLM-tolkning av fritext-frekvens | `status: complete`, conf 0.99, freq=BID |
| `ambiguous-dosage.json` | Review-pathway-trigger | `status: human-review-required`, conf 0 |

Verifierade mot deploy-instans 2026-05-11.

---

## 5. Sannolika frågor + svar

Se [`Human_Review_Demo_Talking_Points.md`](Human_Review_Demo_Talking_Points.md)
för utförliga svar på:

- §1 — "Vad händer om systemet inte vet?"
- §2 — "Hur ofta händer det?"
- §3 — "Är det inte risk att systemet säger 'jag vet inte' för ofta?"
- §4 — "Hur skiljer det er från Epic/Cerner/Cosmic?"
- §5 — "Vad gör en kliniker faktiskt med en review-payload?"
- §6 — "Är detta produktion-ready?"
- §7 — "Hur skiljer ni produktion från demo? Använder ni cloud-AI?" (CIO-fråga)

---

## 6. Troubleshooting

### 6.1 Container ej responsiv

```bash
ssh SkyttenAdmin@192.168.1.189
DOCKER=/volume2/@appstore/ContainerManager/usr/bin/docker
$DOCKER ps --filter name=composition-mapper
$DOCKER logs --tail 50 nimloth-composition-mapper
```

Vanliga problem:
- **Anthropic-credits slut:** Logga in på Anthropic-konsolen, fyll på, restart.
  Symptom i logs: `429 insufficient_quota` eller `credit balance is too low`.
- **Network till `api.anthropic.com` nere:** Vänta eller switch:a till fallback
  via env-override (kräver omstart).
- **.env-värden saknas efter restart:** Kontrollera
  `/volume2/docker/nimloth-core/.env` har alla 5 kritiska variabler:
  ```bash
  for var in ANTHROPIC_API_KEY NIMLOTH_DATA_MODE KAFKA_BROKERS LOG_LEVEL; do
    VAL=$(grep "^${var}=" /volume2/docker/nimloth-core/.env | head -1 | cut -d= -f2-)
    echo "${var}: length=${#VAL}"
  done
  ```

### 6.2 API-call hänger > 30s

Anthropic är troligen rate-limited eller nere. Kontrollera:
- https://status.anthropic.com
- Om OK: kolla container-logs för specifika fel-meddelanden.

### 6.3 Live-anrop returnerar 500

```bash
ssh SkyttenAdmin@192.168.1.189
DOCKER=/volume2/@appstore/ContainerManager/usr/bin/docker
$DOCKER logs --tail 100 nimloth-composition-mapper | grep -E "ERROR|FAIL|err"
```

Vid behov: sätt `LOG_LEVEL=debug` temporärt:
```bash
# Edit .env, sed -i "s|^LOG_LEVEL=.*|LOG_LEVEL=debug|" /volume2/docker/nimloth-core/.env
# Kör force-recreate (restart räcker inte — .env läses bara vid recreate)
DOCKER_COMPOSE=/volume2/@appstore/ContainerManager/usr/bin/docker-compose
cd /volume2/docker/nimloth-core
$DOCKER_COMPOSE -f docker-compose.deploy.yml up -d --force-recreate composition-mapper
```

Kom ihåg att sätta tillbaka `LOG_LEVEL=info` efter felsökning.

### 6.4 Live-anrop returnerar 400 (validation_error)

Request body matchar inte FHIR-MedicationStatement-schemat. Vanliga fel:
- Saknad `resourceType: "MedicationStatement"`
- Saknad `status`
- Saknad `subject.reference`
- `medicationCodeableConcept` saknar `coding`-array

Verifiera mot demo-fixtures som mall.

---

## 7. Restart-procedur (mid-demo)

Om något brister mitt under demo:

```bash
ssh SkyttenAdmin@192.168.1.189
DOCKER_COMPOSE=/volume2/@appstore/ContainerManager/usr/bin/docker-compose
cd /volume2/docker/nimloth-core
$DOCKER_COMPOSE -f docker-compose.deploy.yml restart composition-mapper
sleep 10
curl -sf http://localhost:11102/health | jq '.status'
```

**Notera:** `restart` läser INTE om `.env`. För att picka upp nya env-värden
måste det vara `down + up` eller `up --force-recreate`. Se synology-ops-skill.

---

## 8. Post-demo

### 8.1 Notera frågor som inte kunde besvaras
Lägg dem i en uppföljnings-fil eller direkt i
`Human_Review_Demo_Talking_Points.md` för nästa demo.

### 8.2 Granska Anthropic-cost
Kontrollera kvarvarande balans på `console.anthropic.com`. En typisk demo
förbrukar $0.10-0.50.

### 8.3 Uppdatera demo-fixtures
Om CIO specifikt frågade om en use-case som inte fanns — lägg till en fixture
i `docs/operations/demo-fixtures/` för nästa gång.

---

## 9. Referenser

- [`services/composition-mapper/README.md`](../../services/composition-mapper/README.md) — service-doc + HTTP API
- [`Human_Review_Pathway_Design.md`](Human_Review_Pathway_Design.md) — aggregator-design + threshold-kalibrering
- [`Human_Review_Demo_Talking_Points.md`](Human_Review_Demo_Talking_Points.md) — CIO-frågor och svar
- [`Demo_Mode_Configuration.md`](Demo_Mode_Configuration.md) — `NIMLOTH_DATA_MODE` + sensitivity-tier
- [`Pre_Public_Demo_Checklista.md`](Pre_Public_Demo_Checklista.md) — tidigare allmän demo-checklista
- [`docker-compose.deploy.yml`](../../docker-compose.deploy.yml) — deploy-konfig
- [`nimloth-docs/P4_Composition_Mapper.md`](../../nimloth-docs/P4_Composition_Mapper.md) §14 — slutkonsolidering

---

## 10. Revisionslogg

| Version | Datum | Ändring |
|---|---|---|
| v1 | 2026-05-11 | Initial leverans (B25 post-polish). Pre-demo-checklist, 6-stegs demo-flöde, 3 verifierade demo-fixtures, troubleshooting + restart-procedur. |
| v1.1 | 2026-05-11 | B25.2: Ny §2 "Access-vägar för demo" (LAN, SSH port-forward, Cloudflare-tunnel-not). Renumrering §2→§3 (Demo-flöde), §3→§4 (Fixtures), §4→§5 (Frågor), §5→§6 (Troubleshooting), §6→§7 (Restart), §7→§8 (Post-demo), §8→§9 (Referenser), §9→§10 (Revisionslogg). Internt-referens i §1.1 uppdaterad. |

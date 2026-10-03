# WP-CDS1 — CDS Hook syntetisk trigger (Fas D)

Status: levererad i `cds-hooks`. **Dataklass 0** — syntetisk Fru Andersson-fixture.

## CDS Hooks 2.0 (runtime)

| Yta | URL (default port 3004) |
|-----|-------------------------|
| Health | `GET /health` |
| Discovery | `GET /cds-services` |
| Patient-view (samlad) | `POST /cds-services/core-patient-alerts` |
| Enskilda regler | `POST /cds-services/core-anticoagulation-check` m.fl. |

### Syntetisk trigger (hermetisk / CI)

Skicka **prefetch i hook-body** så att inget FHIR-anrop behövs:

```bash
curl -sS -X POST "http://localhost:3004/cds-services/core-patient-alerts" \
  -H "Content-Type: application/json" \
  -d @- <<'EOF'
{
  "hookInstance": "manual-demo",
  "hook": "patient-view",
  "context": {
    "userId": "Practitioner/SE-DEMO",
    "patientId": "Patient/19500315-2384"
  },
  "prefetch": { }
}
EOF
```

(Ersätt `"prefetch": { }` med innehållet från `syntheticFruAnderssonPrefetch()` i
`src/fixtures/synthetic-fru-andersson.ts` — se Vitest `hook-smoke.test.ts`.)

### Live stack (FHIR Facade)

Utan prefetch hämtas data från `FHIR_BASE_URL` (default `http://fhir-facade:3003/fhir/r4`).
Kräver WP-FHIR1 / `./scripts/start.sh` eller demo-slice.

```bash
./scripts/demo-fru-andersson.sh   # steg 5 — CDS cards mot live FHIR
```

## UI och logg

- **Dashboard:** `/patient/19500315-2384/cds` — visar cards (proxy `/api/cds`).
- **Logg:** varje hook loggar `{ service, patientId, cards }` på info-nivå.

## AI Act — demo, inte medicinteknisk produkt

Denna tjänst levererar **regelbaserade demo-varningar** (ATC/ICD/SNOMED-stub) för att
visa CDS Hooks-koppling i Nimloth-referensarkitekturen. Den ska **inte** användas som
kliniskt beslutsstöd eller registreras som medicinteknisk produkt. **Ingen** maskininlärning;
**ingen** behandling av riktiga patientdata i repo/CI.

## Tester

```bash
./scripts/wp-cds1-smoke.sh
pnpm --filter @nimloth-core/cds-hooks test
```

Spec: `spec/wp-cds1-cds-hook-synthetic.md`.

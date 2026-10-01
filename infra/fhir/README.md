# FHIR i Nimloth Core (DP-MF3)

Tekniskt spår för **Implementation Guide (IG)**-artefakter via [FSH](https://build.fhir.org/ig/HL7/fhir-shorthand/) och [SUSHI](https://github.com/FHIR/sushi). v1 är en minimal stub-IG med SUSHI-only CI — ingen koppling till MF2/OPT. **Runtime:** `fhir-facade` sätter `Patient.meta.profile` till stub-canonical (WP-FHIR1, se `services/fhir-facade/docs/WP-FHIR1-FHIR-SE-SMART.md`).

## Mappstruktur

- `ig/` — IG-projektrot (`sushi-config.yaml`, `input/fsh/`, genererad output under `fsh-generated/` vid build)
- `ig/test-fixtures/` — medvetet ogiltig FSH för CI fail-case (kopieras aldrig till `input/fsh/`)
- `scripts/` — verifieringsscript som CI och lokalt kör

Placeholder-metadata (tills riktig SE-IG finns):

| Fält | v1-värde |
|------|----------|
| `packageId` / `id` | `se.nimloth.fhir.stub` |
| `canonical` | `https://fhir.nimloth.local/ig/stub` |

## Kommandon (lokal)

Kräver Node.js 20+:

```bash
cd infra/fhir && npm install
npm run verify:green
npm run verify:fail-case
```

Alternativt global SUSHI (`npm install -g fsh-sushi`) och samma `bash scripts/...`-anrop från `infra/fhir/`.

```bash
cd infra/fhir/ig && sushi
```

Efter lyckad körning finns minst en `StructureDefinition-*.json` under `ig/fsh-generated/resources/` (profilen `nimloth-stub-patient`).

## CI (PR-gate)

Workflow: `.github/workflows/fhir-ig.yml`

Triggas vid PR som rör `infra/fhir/**` eller själva workflow-filen (se Q5 i MF3-spec). **Separat** från openEHR MF1/MF2 och från `fhir-facade-publish.yml` (Docker build/push av runtime-fasaden — annat syfte, andra paths).

Verifieringsmatris: `DP-MF3-VERIFICATION.md`.

## IG Publisher (v1 — dokumenterat minimum, inte full CI)

v1 kör **endast SUSHI** i GitHub Actions. Det räcker för att validera FSH-syntax, generera StructureDefinition/StructureMap m.m. och fånga ogiltig FSH via fail-case.

**Varför inte full HL7 IG Publisher i CI än?**

- Publisher kräver Java, större artefaktträd och ofta nätverks-/cache-beroenden för terminologi — tyngre och flakigare än SUSHI-only för en stub.
- Nimloth har ännu ingen committad full SE-IG; stub canonical/packageId är placeholders.
- Runtime-FHIR (`services/fhir-facade/`) levereras redan via egen workflow; IG-publicering är modellfabrik, inte deploy av fasaden.

**Hur man kör Publisher lokalt senare (när IG växer):**

1. Kör SUSHI så `fsh-generated/` och `input/` är uppdaterade (`bash infra/fhir/scripts/verify-sushi-green.sh`).
2. Installera [FHIR IG Publisher](https://github.com/HL7/fhir-ig-publisher) (Java 17+).
3. Från `infra/fhir/ig/`: `publisher -ig .` (eller motsvarande enligt HL7-dokumentation för din Publisher-version).
4. Granska HTML under `output/` lokalt; committa inte genererad Publisher-output i v1.

När en riktig IG ska publiceras kan ett separat CI-steg/workflow läggas till — utanför MF3 v1-scope.

## Processgräns: Verkstaden ↔ Nimloth Core

- **Mänsklig process (Verkstaden):** Klinisk/semantisk profildesign, nationella SE-profiler, terminologi och publiceringsbeslut. Se processdokumentation i [VGR Datahubb Verkstad](https://github.com/anderscarlius/vgr-datahubb-verkstad).
- **Teknisk CI MF3 (detta repo):** FSH kompilerar, StructureDefinition genereras, ogiltig FSH failar CI.

**Out of scope i MF3 v1:** MF1/MF2-omskrivning, OPT→FSH-generering, Moria-deploy, full SE-IG, IG Publisher i CI.

## Inventering — relaterade workflows (återanvändning)

| Workflow | Syfte | Paths (kort) |
|----------|--------|----------------|
| `fhir-ig.yml` | MF3 SUSHI stub-IG, PR-gate | `infra/fhir/**` |
| `fhir-facade-publish.yml` | Bygg/test/push runtime `fhir-facade` image | `services/fhir-facade/**`, `packages/shared/**`, … |
| `openehr-ci-level1.yml` / `level2.yml` | openEHR MF1/MF2 | `infra/openehr/**` |

Ingen automatisk koppling mellan tabellens rader i v1.

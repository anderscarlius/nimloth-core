# Path-baselines (DP-MF2)

Sorterade RM-sökvägar extraherade från compiler-genererad OPT 1.4 XML. MF2 CI
jämför att **inga committade paths försvinner** oväntat när ADL/compile-logik ändras
(path-diff = strukturell regression, inte semantisk klinisk validering).

## Format

En fil per template, t.ex. `body_temperature.v2.p3_0b.paths.txt` — en path per rad.
Rader som börjar med `#` ignoreras.

Paths byggs av `OptPathInventory` (Java, single source of truth) som kombinerar
`rm_attribute_name`-segment och `[at####]`-noder i OPT `<definition>`.

## Uppdatera baseline medvetet

Efter godkänd arketyp- eller compiler-ändring som **avsiktligt** ändrar strukturen:

```bash
cd infra/openehr/compiler
GENERATE_PATH_BASELINES=true mvn test -Dtest=CompileMainTest#generatePathBaselines
```

Granska git-diff, committa uppdaterade `.paths.txt` i samma PR som ADL/compiler-ändringen.

## Verifiering lokalt / i CI

```bash
bash infra/openehr/scripts/check-opt-path-baseline.sh \
  infra/openehr/templates/body_temperature.v2.p3_0b.opt \
  infra/openehr/path-baselines/body_temperature.v2.p3_0b.paths.txt
```

(Kräver att `pnpm openehr:compile` eller `mvn exec:java` redan har genererat OPT.)

Vitest: `pnpm --filter @nimloth-core/e2e exec vitest run openehr-mf2.test.ts` (kräver EHRbase).

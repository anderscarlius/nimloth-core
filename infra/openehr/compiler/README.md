# openEHR Compiler — Nimloth Core

Java-baserad ADL-pipeline. Kör i Docker. Triggas via `pnpm openehr:compile`.

## Aktuellt läge

**Version:** 0.1.0-diagnostic (Fas 3.0 / pivot C)

Compilern är i sitt nuvarande läge en **valider-och-rapportera-tool för ADL-källfiler** — inte en full ADL→OPT-kompilator. Skälet är dokumenterat i [`PHASE-3.0-REPORT.md`](PHASE-3.0-REPORT.md): out-of-the-box bridge mellan archie:s AOM-objekt och EHRbase-accepterad XML-OPT 1.4 finns inte. Den uppgraderingen är planerad till **P3.0b**.

Sprint 2:s composer/AQL-broker (P3.1+) använder istället fixtures från `../test-fixtures/` direkt.

## Snabbstart

```bash
# Bygg imagen lokalt
bash scripts/build-image.sh

# Kompilera ADL → diagnostic rapport (Fas 3.0)
pnpm openehr:compile

# Ladda fixtures + ev. compiler-output → EHRbase
docker compose up -d ehrbase-db ehrbase
pnpm openehr:load-templates
```

## Struktur

```
compiler/
├── Dockerfile                 # eclipse-temurin:21 + maven 3.9.15 (multi-stage)
├── pom.xml                    # archie-all:3.14.0 + slf4j 2.0.13
├── README.md                  # Den här filen
├── CHANGELOG.md               # Versionsbeslut + uppgraderingsguide
├── PHASE-3.0-REPORT.md        # SDK-utforskning, pivot-beslut, P3.0b-skiss
├── scripts/
│   ├── verify-archie-version.sh
│   ├── build-image.sh
│   └── run-compile.sh
└── src/main/java/se/nimloth/openehr/compiler/
    └── CompileMain.java       # CLI entrypoint
```

## Versionshantering

### Uppgradera archie

Se [`CHANGELOG.md`](CHANGELOG.md) för steg-för-steg.

### Uppgradera Maven

Apache rotates dlcdn-downloads. Vid 404 från Dockerfile:

```bash
curl -s "https://dlcdn.apache.org/maven/maven-3/" | grep -oE 'href="3\.[0-9]+\.[0-9]+/"'
```

Uppdatera `MAVEN_VERSION` + `MAVEN_SHA512` i `Dockerfile`.

## Felsökning

### Compilern producerar inte XML-OPT

**Det är medvetet i 0.1.0-diagnostic.** P3.0b adresserar denna fråga.

För Sprint 2 används fixtures från `../test-fixtures/` som "templates". Composer + AQL-broker behöver inte vänta på P3.0b.

### Maven-bygget failar med "could not resolve archie"

Kontrollera att archie-versionen i `pom.xml` finns på Maven Central:

```bash
bash scripts/verify-archie-version.sh com.nedap.healthcare.archie archie-all 3.14.0
```

Om version inte finns: kör scriptet utan version-argument för att se senaste tillgängliga.

### EHRbase avvisar OPT med HTTP 400/406

I 0.1.0-diagnostic POSTar vi inte compiler-output till EHRbase. Bara fixtures
laddas via `pnpm openehr:load-templates`. Om fixtures avvisas:

1. Kontrollera SHA256 mot `../test-fixtures/PROVENANCE.md`
2. Kontrollera att EHRbase är version 2.x (kräver XML-OPT 1.4)
3. Kontrollera namespace: `xmlns="http://schemas.openehr.org/v1"`

## P3.0b — uppföljning

Kort: behövs en bridge mellan archie:s AOM-objekt och xmlbeans-genererade
opt-1.4-klasser. Tre realistiska vägar:

1. Egen field-by-field-bridge i Java
2. XSLT-transform på archie-output
3. Lyfta motsvarande klass från ehrbase-internals

Se [`PHASE-3.0-REPORT.md`](PHASE-3.0-REPORT.md) för full diskussion.

## Roadmap

- **Nivå 1 (NU — P3.0):** Batch compiler, manuell trigger
- **Nivå 2 (P3.5):** Runtime compiler-tjänst
- **Nivå 3 (P3.6):** Dashboard ADL-editor
- **Nivå 4 (P3.7+, valfri):** JS-native compiler

P3.0b är en sub-prompt mellan P3.0 och P3.1 som adresserar den specifika ADL→XML-OPT-bridgen.

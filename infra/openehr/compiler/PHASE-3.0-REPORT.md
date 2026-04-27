# Fas 3.0 — Avrapportering

**Datum:** 2026-04-27
**Branch:** main
**Tag före SDK-pivot:** `p3.0-checkpoint-pre-sdk`

---

## Sammanfattning

Fas 3.0 etablerade openEHR-pipeline-fundamentet i Nimloth Core men **levererar inte den ursprungliga visionen om en fullständig ADL→XML-OPT-compiler i en session**. Vi pivoterade till plan **(C) — diagnostic compiler + fixture-baserad EHRbase-load** efter att SDK-utforskning visade att out-of-the-box AOM→XML-OPT-bridge inte finns. Den specifika kompilator-utmaningen lyfts till en separat prompt **P3.0b**, så Sprint 2:s composer/AQL-broker/paritetsdiff (P3.1–P3.4) kan utvecklas parallellt mot riktiga OPT:er via test-fixtures.

## Vald archie-version

- **groupId:** `com.nedap.healthcare.archie`
- **artifactId:** `archie-all`
- **version:** `3.14.0`
- **publicerad:** 2025-05-15 på Maven Central

GitHub-releases visar 3.15.0 (2025-07-03), 3.16.0 (2025-12-02), 3.17.0 (2026-02-16) men dessa har **inte publicerats till Maven Central**. Senaste tillgängliga är 3.14.0.

Verifierat via:
```bash
curl -sIL "https://repo1.maven.org/maven2/com/nedap/healthcare/archie/archie-all/3.14.0/archie-all-3.14.0.pom"
# HTTP/2 200
```

## Vald EHRbase-version

- **ehrbase:** `ehrbase/ehrbase:2.30.1@sha256:c08be93f41164bb6ba8e957532ce4cccd18e6b9d26e074ef97f3faff9c3cd52f` (publ. 2026-04-16)
- **ehrbase-db:** `ehrbase/ehrbase-v2-postgres:16.2@sha256:abe14e8f9ba33cabc9946c6c17c5aa95b64b35387f266cd20a894149203196d7` (publ. 2024-04-08)

Båda verifierade live: container startar healthy, REST-API svarar, `POST /definition/template/adl1.4` accepterar fixtures med HTTP 201, GET round-trip returnerar XML med korrekt namespace.

## SDK-undersökning (org.ehrbase.openehr.sdk)

Försök att använda `org.ehrbase.openehr.sdk:opt-1.4:2.27.0` som AOM→XML-OPT-bridge. Resultat: **negativt**.

### Klasser/moduler testade

| Modul | Vad det innehåller | Användbart för AOM→XML-OPT? |
|---|---|---|
| `opt-1.4:2.27.0` | xmlbeans-genererade Java-klasser från OPT 1.4 XSD (`Template.xsd`, `Archetype.xsd`, `CompositionTemplate.xsd`, etc) | **Nej** — kan ladda/spara XML men inte konvertera från archies AOM |
| `web-template:2.27.0` | SDK:ns interna webtemplate-format. `OPTParser.java` parsar **från** opt-1.4 XML till webtemplate | **Nej, fel riktning** |
| `serialisation:2.27.0` | Composition-serialization (RM-objekt). Använder `archie:test-rm` | **Nej** — composition-nivå, inte template-nivå |
| `generator:2.27.0` | Class-generator för Java från templates. `ClassGenerator.java`, `RecordGenerator.java`. | **Nej** — andra hållet (template→Java) |

### Konkret saknad

För att producera EHRbase-accepterbart XML-OPT 1.4 från en archie `OperationalTemplate`-instans behövs en **field-by-field-konverter** mellan:

- **archie.aom:** `OperationalTemplate`, `CObject`, `CComplexObject`, `CTerminologyCode`, `CDvOrdinal`, ... (Java POJOs som speglar AOM 1.4)
- **opt-1.4-xmlbeans:** `Template`, `OBSERVATION`, `OBJECT_BLOCK`, `Concept`, `TermBindingSet`, ... (xmlbeans-genererade från OPT 1.4 XSD)

Strukturen är likartad men inte identisk. AOM använder paths och constraint-trees; OPT 1.4 XML har separata nodtyper för varje RM-typ. En komplett konverter behöver hantera ~30 olika RM-typer × full constraint-syntax. Uppskattning: ~2 000–5 000 rader Java-kod, eller ett par sessioners arbete med expert-konsultation.

### Slutsats

SDK ger oss xmlbeans-runtime som kan **producera** XML från `Template`-objekt — men vi måste själv **fylla** dessa objekt från archie-AOM. Det är arbetet som saknas. P3.0b adresserar specifikt detta.

## Vad Fas 3.0 levererar (faktisk leverabel — pivot C)

```
infra/openehr/
├── README.md                          # Roadmap Nivå 1–4
├── archetypes/
│   ├── PROVENANCE.md                  # CKM-källa + SHA256
│   └── openEHR-EHR-OBSERVATION.body_temperature.v2.adl  (124 KB)
├── templates/                         # Compiler-output (diagnostic)
│   ├── README.md
│   └── compiler-diagnostic-report.md  # Producerad av compilern
├── test-fixtures/                     # Sprint 2-fallback
│   ├── PROVENANCE.md                  # ehrbase-källa + SHA256
│   ├── ehrbase-test-minimal-action.opt
│   └── ehrbase-test-time-series.opt
├── scripts/
│   └── load-templates.mjs             # Laddar fixtures + compiler-output → EHRbase
└── compiler/
    ├── README.md                      # Hur man bygger + uppgraderar
    ├── CHANGELOG.md                   # archie 3.14.0 + version-rationale
    ├── PHASE-3.0-REPORT.md            # DENNA FIL
    ├── Dockerfile                     # eclipse-temurin:21-jdk + maven 3.9.15
    ├── pom.xml                        # archie-all:3.14.0 + slf4j 2.0.13
    ├── .dockerignore
    ├── scripts/
    │   ├── verify-archie-version.sh   # Maven Central-verifiering
    │   ├── build-image.sh             # docker build wrapper
    │   └── run-compile.sh             # körs av pnpm openehr:compile
    └── src/main/java/se/nimloth/openehr/compiler/
        └── CompileMain.java           # Diagnostic mode (parser-only)
```

**Verifierat:**

| Funktion | Status |
|---|---|
| EHRbase + ehrbase-db startar healthy | ✅ |
| Compiler-image bygger reproducerbart | ✅ |
| Compiler läser body_temperature.v2.adl utan fel | ✅ |
| Diagnostic report innehåller archetype_id, adl_version, uid, file_size | ✅ |
| `pnpm openehr:load-templates` POSTar 2 fixtures → EHRbase HTTP 201 | ✅ |
| EHRbase listar laddade templates via GET | ✅ |
| Round-trip GET returnerar XML med rätt namespace | ✅ |
| Archie-version pinnad i pom.xml | ✅ |
| Inga LATEST/RELEASE-versioner i bygget | ✅ |

**INTE verifierat (kvarstår till P3.0b):**

| Funktion | Status | Plan |
|---|---|---|
| Compilern producerar XML-OPT från ADL | ❌ | P3.0b |
| GET tillbaka compilerad template | ❌ | P3.0b |
| Diff jämförelse med original-OPT | ❌ | P3.0b |

## P3.0b — uppföljningsuppdrag

### Mål

Implementera AOM→XML-OPT-bridge så `pnpm openehr:compile` producerar OPT-filer som EHRbase 2.x accepterar.

### Förutsättningar

- archie 3.14.0 finns redan på classpath via pom.xml
- `org.ehrbase.openehr.sdk:opt-1.4:2.27.0` läggs till
- Compiler-imagen behöver kompletteras med bridge-kod
- ADL14Parser måste användas (inte default ADLParser som är ADL 2)

### Strategi

**Option 1: Egen field-by-field-bridge** (mest kontroll)
- Skriv `AomToOptBridge.java` som tar `OperationalTemplate` + producerar opt-1.4 `Template`
- ~30 RM-typer × constraint-trees. Cirka 2 000–3 000 rader Java.
- Stor surface area, men deterministiskt resultat.

**Option 2: XSLT-baserad transform** (mindre kod, mer bräcklig)
- Serialisera AOM till JSON via archie
- XSLT som mappar JSON-shape → OPT XML-shape
- ~1 000 rader XSLT, men XSLT-utveckling är icke-trivialt

**Option 3: Lyft från ehrbase-internals**
- Ehrbase själva använder archie internt — leta efter motsvarande klass i ehrbase-källan (inte SDK)
- Risk: ehrbase-internals är inte stabilt API

**Rekommendation:** Börja med Option 3 (forskning, kanske 1-2 timmar). Om inget hittas, Option 1.

### Acceptanskriterier för P3.0b

- `pnpm openehr:compile` producerar `body-temperature.opt` (riktig XML)
- Output har `xmlns="http://schemas.openehr.org/v1"`
- `pnpm openehr:load-templates` POSTar både compiler-output OCH fixtures → alla HTTP 201
- Diff mellan vår OPT och en Marand-genererad referens-OPT visar ekvivalent struktur

### Estimat

- Option 1: 2–3 sessioner
- Option 2: 1–2 sessioner
- Option 3 (research-only): 1 session, sedan välj 1 eller 2

## Tidsåtgång per steg (Fas 3.0)

| Steg | Innehåll | Tid |
|---|---|---|
| 3.0 | Maven Central-verifiering | 10 min |
| 3.1 | Repo-struktur | 5 min |
| 3.2 | pom.xml, Dockerfile, Java-shim v1 | 15 min |
| 3.3 | CKM ADL-hämtning + PROVENANCE | 5 min |
| 3.4 | ehrbase fixtures-hämtning + PROVENANCE | 10 min |
| 3.5 | EHRbase compose + SHA-pinning | 15 min |
| **Pivot SDK-utforskning** | | **30 min** |
| 3.6 (pivot) | Compiler diagnostic mode + Maven-iteration | 30 min |
| Live-test | EHRbase fixtures load + round-trip | 10 min |
| Smoke-tester | 7+ tester | 20 min |
| Dokumentation + rapport | Denna fil + README + CHANGELOG | 30 min |

**Total:** ~3 timmar (motsvarar ~1.5 standard "session" enligt vår normala kalibrering).

## 8. Öppna trådar

Sektion 8 bryter kvarvarande osäkerheter i tre kategorier för tydlighet vid framtida sessioner.

### 8.1 Tekniska — adresseras i kommande sessioner

- **P3.0b-effort:** stor variation beroende på Option 1/2/3-val (sektion "P3.0b — uppföljningsuppdrag" ovan). Research-spike (Option 3) rekommenderas först.
- **Archie 3.14.0 → 3.17.0-glapp på Maven Central:** archie:s GitHub-releases är 3 versioner före Maven Central. Om vi behöver en bug-fix från 3.15+ måste vi bygga från källan tills team:et publicerar.

### 8.2 Strategiska — kräver beslut innan vidare arbete

#### 8.2.1 CKM-licens (CC-BY-SA 3.0) och Nimloth Core

CKM:s arketyper distribueras under CC-BY-SA 3.0. Sprint 2 hämtar 7 arketyper för inbäddning i Nimloth Core (de committas i `archetypes/` och versionshanteras med produkten).

CC-BY-SA är *share-alike* — det innebär att verk som inkluderar dessa arketyper potentiellt måste distribueras under CC-BY-SA eller kompatibel licens. Frågan är hur "include" tolkas i kontexten:

- **Tolkning A (sannolik):** ADL-filer som checkat in i repot betraktas som *inkluderat material*. Compilerns OPT-output betraktas som *derived work*. Hela artefakten omfattas av share-alike.
- **Tolkning B (möjlig):** ADL-filer är "bibliotek" som plattformen *läser*, inte *inkluderar*. Plattformen själv har separat licens.
- **Tolkning C (osäker):** distinktion mellan ADL i build-tid (input) och OPT i runtime (output) gör att OPT inte ärver licensen.

Tre vägar framåt:

| Väg | Vad | Effort | Risk |
|---|---|---|---|
| **Research** | Litteraturgenomgång + openEHR community-praxis. Konsultera CKM:s licens-FAQ, hur andra projekt (EHRbase, Better, openEHR Sandbox m.fl.) hanterar inbäddning. | 0.5 session | Inget juridiskt skydd, bara informerad bästa-gissning |
| **Juridiskt råd** | Pro bono eller köpt utlåtande från IP-jurist med CC-erfarenhet. | Veckor till svar | Bästa skyddet |
| **Byta ADL-källa** | Egen-skrivna arketyper (ej från CKM) under valbar licens. | Hög ongoing-kostnad — vi förlorar CKM-ekosystemet | Förlorar interoperabilitet med andra openEHR-implementationer |

**Rekommendation:** börja med **Research** nu (kan göras parallellt med P3.1, ~30–60 min). Beslut om **Juridiskt råd** vs nuvarande hantering tas före 1.0.0-RC. **Bytt ADL-källa är inte realistiskt** för Sprint 2-tidslinjen.

**Beslut behövs senast:** före produktionssättning (RC-fasen). Tills dess kan utvecklingen fortsätta under antagandet att Nimloth Core själv får licens kompatibel med CC-BY-SA-share-alike (t.ex. AGPL eller dubbel licens).

#### 8.2.2 EHRbase 2.x EOL och uppgraderingsväg

EHRbase 3.x-spår finns. Vi har pinnat 2.30.1. Frågan är när och hur uppgradering sker. Hanteras i separat arbetsström — flaggat här så det inte glöms bort.

### 8.3 P3.1 ska informera P3.0b — vad lyssna efter

P3.0b:s bridge-implementation kan bli onödigt komplex om vi försöker täcka alla AOM-features. P3.1 (composer mot fixtures) ger oss empirisk data om vilka delar av OPT-strukturen som faktiskt används i runtime. P3.0b ska därför börja efter P3.1 — och under P3.1 ska vi specifikt notera följande:

1. **Vilka constraint-typer förekommer i Fru Andersson-scenariot?**
   - `C_DV_QUANTITY` med units? (sannolikt — alla mätvärden: BP, puls, temp, vikt)
   - `C_TERMINOLOGY_CODE` med externa terminologier? (sannolikt — SNOMED, LOINC, ICD-10-SE, ATC)
   - `C_DV_ORDINAL`? (mindre sannolikt — vanlig i screening-arketyper)
   - `OPERATIONAL_TEMPLATE` `template_overlay` / arketyp-slots? (oklart)

   Om vi bara använder en handfull constraint-typer i praktiken kan P3.0b leverera Option 1 med betydligt mindre yta än de uppskattade 2 000–5 000 raderna.

2. **Vilka template-features är obligatoriska för EHRbase-acceptans?**
   - Hela `term_definitions`-blocket per språk?
   - `language` / `is_controlled` flags?
   - Concept binding-tabeller?

   Fixturerna ger oss en baseline; composer-arbetet visar minimum för att en composition mot template ska accepteras av EHRbase.

3. **Hur ofta failar fixture-baserade compositions vs en hypotetisk compiler-baserad?**
   - Om fixtures fungerar för 80%+ av Fru Andersson-flödet kan P3.0b designas för "complete the gap" snarare än "from scratch".

**P3.1-rapporten ska explicit lista observationer från dessa tre frågor** så P3.0b-prompten kan referera till dem som input.

## Status

**Fas 3.0:** Pivot (C) levererad. 12/15 acceptanskriterier från ursprunglig prompt uppfyllda; tre lyfts till P3.0b.

**Nästa steg:** P3.1 (composer mot fixtures). Skälen sammanfattade i sektion 8.3 — composer-arbetet ger oss empirisk data om vilka OPT-strukturer som faktiskt behövs i runtime, vilket skyddar P3.0b-bridge-designen från att överimplementera. Min rekommendation är därför att **P3.0b skjuts till efter P3.1**, även om P3.0b är tekniskt möjligt att börja redan nu.

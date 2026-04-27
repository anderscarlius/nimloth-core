# CHANGELOG — openEHR Compiler

## 0.1.0-diagnostic — 2026-04-27

Initial setup. Pivot till "diagnostic mode" efter SDK-utforskning visade att
out-of-the-box AOM→XML-OPT-bridge inte finns. Se `PHASE-3.0-REPORT.md` för
full kontext.

### Tekniska beslut

- **Archie:** `com.nedap.healthcare.archie:archie-all:3.14.0`
  - Senaste på Maven Central per 2025-05-15.
  - Verifierad via `https://central.sonatype.com/artifact/com.nedap.healthcare.archie/archie-all/3.14.0`.
  - GitHub-releases finns på 3.15.0–3.17.0 men ej publicerade till Maven Central.

- **Java:** OpenJDK 21 (LTS, eclipse-temurin-image)
- **Maven:** 3.9.15 (senaste på dlcdn.apache.org per 2026-04-27)
- **slf4j:** 2.0.13 (för stabil logging)

### Begränsningar i 0.1.0-diagnostic

- Compilern producerar **inte** XML-OPT.
- Compilern producerar diagnostisk rapport som dokumenterar varje ADL-fil
  (archetype_id, adl_version, uid, file_size, BOM-detection).
- Sprint 2:s composer/AQL-broker använder fixtures från
  `infra/openehr/test-fixtures/` istället för compiler-output.
- Full ADL→XML-OPT-pipeline kommer i P3.0b.

### Reproducerbarhet

- Base images SHA-pinnade (ehrbase, ehrbase-db).
- Maven-version + SHA512-checksum verifieras vid bygge.
- Archie-version pinnad i `pom.xml` properties.

### Hur uppgradera archie

1. Kontrollera senaste version på Maven Central:
   ```bash
   bash scripts/verify-archie-version.sh com.nedap.healthcare.archie archie-all
   ```
2. Uppdatera `<archie.version>` i `pom.xml`.
3. Bygg om imagen:
   ```bash
   bash scripts/build-image.sh
   ```
4. Kör smoke-tester:
   ```bash
   pnpm --filter @nimloth-core/e2e exec vitest run openehr.test.ts
   ```
5. **Om tester failar:** archies API kan ha ändrats. Uppdatera Java-shimet
   under `src/main/java/se/nimloth/openehr/compiler/`.
6. Lägg till entry här med vad som ändrades och varför.

### Hur uppgradera Maven-version

Apache rotates dlcdn-downloads. Vid 404 från `apk add maven`:

```bash
curl -s "https://dlcdn.apache.org/maven/maven-3/" | grep -oE 'href="3\.[0-9]+\.[0-9]+/"'
```

Hämta SHA512 från:
```
https://dlcdn.apache.org/maven/maven-3/<version>/binaries/apache-maven-<version>-bin.tar.gz.sha512
```

Uppdatera `MAVEN_VERSION` + `MAVEN_SHA512` i `Dockerfile`.

# Provenance för archetypes

Detta dokument spårar var varje ADL-fil i denna mapp kommer ifrån.
Hämtningen ska kunna reproduceras från denna information utan tribal knowledge.

Varje arketyp dokumenteras med:
- **CKM-id** — clinical knowledge manager identifier
- **Hämtad från** — exakt URL
- **Hämtningsdatum** — ISO-datum
- **SHA256** — checksumma av ADL-filens innehåll
- **Användning** — vad arketypen används för i Nimloth Core
- **Licens** — typiskt CC-BY-SA 3.0 för CKM-arketyper

---

## openEHR-EHR-OBSERVATION.body_temperature.v2.adl

- **CKM-id:** `openEHR-EHR-OBSERVATION.body_temperature.v2`
- **UID:** `fbff84f3-2b33-4245-94f1-6dafe6679c54`
- **Hämtad från:** https://raw.githubusercontent.com/openEHR/CKM-mirror/master/local/archetypes/entry/observation/openEHR-EHR-OBSERVATION.body_temperature.v2.adl
- **CKM-mirror commit:** `master` per 2026-04-27 (verifierbar via `git log` om mirror-repot klonas)
- **Hämtningsdatum:** 2026-04-27
- **SHA256:** `5f3561def29748f73da74c9ab8c715195ad08cefc144954c49c0c68b13472ec3`
- **Filstorlek:** 124 141 bytes
- **ADL-version:** 1.4
- **Användning:** Verifierings-arketyp för P3.0-pipelinen. Vald som en stabil,
  publik CKM-arketyp som täcker realistisk komplexitet (event-baserad observation
  med flera mätpunkter, units, tolkning, position, anatomical site) utan att vara
  ohanterligt stor. Den används i Steg 3.3 av P3.0 för att verifiera att
  compilern kan parse:a, flatta och serialisera en typisk klinisk arketyp.
- **Licens:** CC-BY-SA 3.0 (openEHR Foundation)

### Reproduktionssteg

```bash
curl -fsSL "https://raw.githubusercontent.com/openEHR/CKM-mirror/master/local/archetypes/entry/observation/openEHR-EHR-OBSERVATION.body_temperature.v2.adl" \
  -o infra/openehr/archetypes/openEHR-EHR-OBSERVATION.body_temperature.v2.adl
shasum -a 256 infra/openehr/archetypes/openEHR-EHR-OBSERVATION.body_temperature.v2.adl
# Förväntad SHA256: 5f3561def29748f73da74c9ab8c715195ad08cefc144954c49c0c68b13472ec3
```

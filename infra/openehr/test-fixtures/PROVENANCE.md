# Provenance för test-fixtures

Filerna i denna mapp är **inte runtime-leverabler**. De är externa
referens-OPT från ehrbase-integration-tests som används som strukturell
jämförelsepunkt för compileringspipelinen.

Användning:
- Smoke-tester jämför struktur av vår compilers output mot dessa
- EHRbase-load-test verifierar att dessa OPT laddas utan fel
  (om EHRbase avvisar dem så är något fel med EHRbase-konfigurationen,
  inte med vår compiler)

Båda fixtures har formatet:

```xml
<?xml version="1.0" encoding="utf-8"?>
<template xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xmlns:xsd="http://www.w3.org/2001/XMLSchema"
          xmlns="http://schemas.openehr.org/v1">
  ...
</template>
```

Detta är XML-OPT 1.4-formatet som EHRbase 2.x:s `/definition/template/adl1.4`-
endpoint accepterar. Båda är genererade av Ocean Template Designer 2.8.94Beta
(commercial tool) men distribueras under samma licens som ehrbase-integration-tests
(Apache 2.0).

---

## ehrbase-test-minimal-action.opt

- **Källa:** https://github.com/ehrbase/integration-tests/blob/main/tests/robot/_resources/test_data_sets/valid_templates/minimal/minimal_action.opt
- **Branch:** main per 2026-04-27
- **Hämtad URL:** https://raw.githubusercontent.com/ehrbase/integration-tests/main/tests/robot/_resources/test_data_sets/valid_templates/minimal/minimal_action.opt
- **Hämtningsdatum:** 2026-04-27
- **SHA256:** `98b9282aee8ce1d03bbbd9776246506d0af90c50bc4d1f59677537b75e93228b`
- **Filstorlek:** 22 042 bytes
- **Användning:** Strukturell referens (en av de mest minimala validerade OPT:er
  som EHRbase använder för smoke-test). Används av compiler-smoke-tester för
  att jämföra vår output mot ett känt-fungerande format.
- **Licens:** Apache 2.0 (per ehrbase-integration-tests-repot)

## ehrbase-test-time-series.opt

- **Källa:** https://github.com/ehrbase/integration-tests/blob/main/tests/robot/_resources/test_data_sets/valid_templates/time_series/time_series.opt
- **Branch:** main per 2026-04-27
- **Hämtad URL:** https://raw.githubusercontent.com/ehrbase/integration-tests/main/tests/robot/_resources/test_data_sets/valid_templates/time_series/time_series.opt
- **Hämtningsdatum:** 2026-04-27
- **SHA256:** `aeb2f9ad458f9c531ca34ce158776b9397c6b453dc064339014a2c54cdd6189a`
- **Filstorlek:** 13 529 bytes
- **Användning:** Sekundär strukturell referens — visar event-baserade
  observationer (samma kategori som body_temperature.v2). Kompletterar
  minimal_action.opt med ett mer realistiskt template-exempel.
- **Licens:** Apache 2.0

---

## Reproduktionssteg

```bash
BASE="https://raw.githubusercontent.com/ehrbase/integration-tests/main/tests/robot/_resources/test_data_sets/valid_templates"
curl -fsSL "${BASE}/minimal/minimal_action.opt" -o infra/openehr/test-fixtures/ehrbase-test-minimal-action.opt
curl -fsSL "${BASE}/time_series/time_series.opt" -o infra/openehr/test-fixtures/ehrbase-test-time-series.opt
shasum -a 256 infra/openehr/test-fixtures/*.opt
```

Förväntade SHA256 listas ovan per fixture.

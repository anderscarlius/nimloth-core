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
- **CKM-mirror commit:** `master` per 2026-04-27
- **Hämtningsdatum:** 2026-04-27
- **SHA256:** `5f3561def29748f73da74c9ab8c715195ad08cefc144954c49c0c68b13472ec3`
- **Filstorlek:** 124 141 bytes
- **ADL-version:** 1.4
- **Användning:** Verifierings-arketyp för P3.0-pipelinen + temperatur-vitals i Sprint 2.
- **Licens:** CC-BY-SA 3.0 (openEHR Foundation)

## openEHR-EHR-OBSERVATION.blood_pressure.v2.adl

- **CKM-id:** `openEHR-EHR-OBSERVATION.blood_pressure.v2`
- **Hämtad från:** https://raw.githubusercontent.com/openEHR/CKM-mirror/master/local/archetypes/entry/observation/openEHR-EHR-OBSERVATION.blood_pressure.v2.adl
- **CKM-mirror commit:** `master` per 2026-04-28
- **Hämtningsdatum:** 2026-04-28
- **SHA256:** `5d07e40060341128f57e44c56441824848c8a8d8eeea85b68306b605fa6d97fa`
- **Filstorlek:** 230 380 bytes
- **ADL-version:** 1.4
- **Användning:** Vitals — blodtryck. P3.1-composer mappar via fixture (time_series.en.v1) tills P3.0b producerar XML-OPT.
- **Licens:** CC-BY-SA 3.0 (openEHR Foundation)

## openEHR-EHR-OBSERVATION.pulse.v2.adl

- **CKM-id:** `openEHR-EHR-OBSERVATION.pulse.v2`
- **Hämtad från:** https://raw.githubusercontent.com/openEHR/CKM-mirror/master/local/archetypes/entry/observation/openEHR-EHR-OBSERVATION.pulse.v2.adl
- **CKM-mirror commit:** `master` per 2026-04-28
- **Hämtningsdatum:** 2026-04-28
- **SHA256:** `84547b34e0575ceef8da2a8dd37bd4716bbd79c1bbb9142c43e67983ed832ac5`
- **Filstorlek:** 179 133 bytes
- **ADL-version:** 1.4
- **Användning:** Vitals — puls. P3.1-composer mappar via fixture (time_series.en.v1).
- **Licens:** CC-BY-SA 3.0 (openEHR Foundation)

## openEHR-EHR-EVALUATION.medication_summary.v1.adl

- **CKM-id:** `openEHR-EHR-EVALUATION.medication_summary.v1`
- **Hämtad från:** https://raw.githubusercontent.com/openEHR/CKM-mirror/master/local/archetypes/entry/evaluation/openEHR-EHR-EVALUATION.medication_summary.v1.adl
- **CKM-mirror commit:** `master` per 2026-04-28
- **Hämtningsdatum:** 2026-04-28
- **SHA256:** `7712ac7fe6085402289c71ba964b8fb563bf6c46d7d8a39880031a5cb20bbd1e`
- **Filstorlek:** 48 437 bytes
- **ADL-version:** 1.4
- **Användning:** Medicineringsdata.
- **Avvikelse från P3.1-spec:** specens `medication_statement.v1` finns inte i CKM-mirror. `medication_summary.v1` är närmaste motsvarighet — täcker samma användningsfall (sammanställning av läkemedel patient står på). Notera: composer kan inte mappa medication-events än (gap loggat för P3.0b — fixturerna saknar EVALUATION-shape).
- **Licens:** CC-BY-SA 3.0 (openEHR Foundation)

## openEHR-EHR-EVALUATION.adverse_reaction_risk.v2.adl

- **CKM-id:** `openEHR-EHR-EVALUATION.adverse_reaction_risk.v2`
- **Hämtad från:** https://raw.githubusercontent.com/openEHR/CKM-mirror/master/local/archetypes/entry/evaluation/openEHR-EHR-EVALUATION.adverse_reaction_risk.v2.adl
- **CKM-mirror commit:** `master` per 2026-04-28
- **Hämtningsdatum:** 2026-04-28
- **SHA256:** `cd691179b7ec929a1e673055f33ba788afcc75629c5220fe8aebf390576ba359`
- **Filstorlek:** 142 504 bytes
- **ADL-version:** 1.4
- **Användning:** Allergi/biverkningsrisk-data (Fru Andersson har dokumenterad penicillinallergi).
- **Avvikelse från P3.1-spec:** specens `.v1` finns inte i CKM-mirror — endast `.v2` publicerad. Vi använder `.v2`. Behövs P3.0b för att kunna mappa.
- **Licens:** CC-BY-SA 3.0 (openEHR Foundation)

## openEHR-EHR-ACTION.procedure.v1.adl

- **CKM-id:** `openEHR-EHR-ACTION.procedure.v1`
- **Hämtad från:** https://raw.githubusercontent.com/openEHR/CKM-mirror/master/local/archetypes/entry/action/openEHR-EHR-ACTION.procedure.v1.adl
- **CKM-mirror commit:** `master` per 2026-04-28
- **Hämtningsdatum:** 2026-04-28
- **SHA256:** `8269c803ac9aa69c9ece95f5fb688613735b9487d0e12d96c17faff400178bf1`
- **Filstorlek:** 214 778 bytes
- **ADL-version:** 1.4
- **Användning:** Procedure (Fru Andersson: höftledsoperation). P3.1-composer mappar via fixture (minimal_action.en.v1) tills P3.0b producerar XML-OPT.
- **Licens:** CC-BY-SA 3.0 (openEHR Foundation)

## openEHR-EHR-EVALUATION.problem_diagnosis.v1.adl

- **CKM-id:** `openEHR-EHR-EVALUATION.problem_diagnosis.v1`
- **Hämtad från:** https://raw.githubusercontent.com/openEHR/CKM-mirror/master/local/archetypes/entry/evaluation/openEHR-EHR-EVALUATION.problem_diagnosis.v1.adl
- **CKM-mirror commit:** `master` per 2026-04-28
- **Hämtningsdatum:** 2026-04-28
- **SHA256:** `ce206e6aa253962e9165de5518fb0f9393a4878f989873a27ec764f576b0693d`
- **Filstorlek:** 240 644 bytes
- **ADL-version:** 1.4
- **Användning:** Diagnoser (ICD-10-SE). Behövs P3.0b för att kunna mappa.
- **Licens:** CC-BY-SA 3.0 (openEHR Foundation)

## openEHR-EHR-OBSERVATION.progress_note.v1.adl

- **CKM-id:** `openEHR-EHR-OBSERVATION.progress_note.v1`
- **UID:** `4c1c083f-70e1-4359-8ea2-07cafca0be0f`, revision 1.1.1
- **Hämtad från:** https://raw.githubusercontent.com/regionstockholm/CKM-mirror-via-modellbibliotek/master/local/archetypes/entry/observation/openEHR-EHR-OBSERVATION.progress_note.v1.adl
- **Källrepo:** Region Stockholms mirror av Modellbiblioteket (`regionstockholm/CKM-mirror-via-modellbibliotek`), i sin tur en fork-kedja från `openEHR/CKM-mirror` — vald i stället för den internationella mirrorn direkt eftersom projektet vill källa svenska arketyper från Modellbibliotekets kanal när möjligt (se `COMPOSITION.encounter.v1.adl` nedan för var den svenska översättningen faktiskt sitter).
- **CKM-mirror commit:** `18edd9e26447380016293f4afcd2ac0806e8c116` per 2026-06-24
- **Hämtningsdatum:** 2026-08-19
- **SHA256:** `47b50c161dbe917003aa48282b20832229e6bd8d851c9a9ff90944e0ef0ec6cb`
- **Filstorlek:** 21 732 bytes
- **ADL-version:** 1.4
- **Original author:** Heather Leslie, Atomica Informatics (2013-04-11)
- **Användning:** Klinisk anteckning (fritext) — innehållsarketyp för Compose Etapp 1:s anteckningskomponent (`note-list-view`). **Ingen svensk översättning finns i mirrorn** (endast en/de/nb/es-ar/nl) — fältetiketter blir engelska tills en svensk översättning bidras uppströms till Modellbiblioteket. Se `Compose_Etapp1_MariaDemon_2026-08-19.md` i nimloth-docs för uppföljning som ett kandidat-bidrag.
- **Licens:** CC-BY-SA **4.0** International (inbäddad i filens `other_details["licence"]` — nyare än repots rot-`LICENSE` som fortfarande anger 3.0; filens egen metadata är auktoritativ för filen).

## openEHR-EHR-COMPOSITION.encounter.v1.adl

- **CKM-id:** `openEHR-EHR-COMPOSITION.encounter.v1`
- **Hämtad från:** https://raw.githubusercontent.com/regionstockholm/CKM-mirror-via-modellbibliotek/master/local/archetypes/composition/openEHR-EHR-COMPOSITION.encounter.v1.adl
- **CKM-mirror commit:** `18edd9e26447380016293f4afcd2ac0806e8c116` per 2026-06-24
- **Hämtningsdatum:** 2026-08-19
- **SHA256:** `f334e2d3b7238c634cf753d19ab6e7900e8ffc4baa4b0c9614be4d55168d866c`
- **Filstorlek:** 45 002 bytes
- **ADL-version:** 1.4
- **Original author:** Thomas Beale, Ocean Informatics UK (2005-10-10)
- **Svensk översättning (`["sv"]`-block):** Kirsi Poikela, Per Nemirovski, Åsa Skagerhult, Manna Vosta — Tieto Sweden AB / B3 HealthTech / Region Östergötland / Karolinska University Hospital. Genuin, väl auktoriserad svensk översättning (inte bara engelska etiketter) — detta är skälet till att kompositions-omslaget hämtas härifrån snarare än direkt från den internationella mirrorn.
- **Användning:** "Vårdkontakt" — kompositions-omslag runt `OBSERVATION.progress_note.v1` för anteckningskomponenten.
- **Licens:** CC-BY-SA **4.0** International (samma auktoritetsanmärkning som ovan).

---

## Reproduktionssteg

Hela uppsättningen kan re-hämtas:

```bash
cd infra/openehr/archetypes
BASE="https://raw.githubusercontent.com/openEHR/CKM-mirror/master/local/archetypes/entry"
curl -fsSL "$BASE/observation/openEHR-EHR-OBSERVATION.body_temperature.v2.adl"   -o openEHR-EHR-OBSERVATION.body_temperature.v2.adl
curl -fsSL "$BASE/observation/openEHR-EHR-OBSERVATION.blood_pressure.v2.adl"     -o openEHR-EHR-OBSERVATION.blood_pressure.v2.adl
curl -fsSL "$BASE/observation/openEHR-EHR-OBSERVATION.pulse.v2.adl"              -o openEHR-EHR-OBSERVATION.pulse.v2.adl
curl -fsSL "$BASE/evaluation/openEHR-EHR-EVALUATION.medication_summary.v1.adl"   -o openEHR-EHR-EVALUATION.medication_summary.v1.adl
curl -fsSL "$BASE/evaluation/openEHR-EHR-EVALUATION.adverse_reaction_risk.v2.adl" -o openEHR-EHR-EVALUATION.adverse_reaction_risk.v2.adl
curl -fsSL "$BASE/action/openEHR-EHR-ACTION.procedure.v1.adl"                    -o openEHR-EHR-ACTION.procedure.v1.adl
curl -fsSL "$BASE/evaluation/openEHR-EHR-EVALUATION.problem_diagnosis.v1.adl"    -o openEHR-EHR-EVALUATION.problem_diagnosis.v1.adl
shasum -a 256 *.adl
```

Förväntade SHA256 listas per arketyp ovan.

De två anteckningsarketyperna (`progress_note.v1`, `encounter.v1`) kommer från Modellbiblioteks-mirrorn (Region Stockholm), inte den internationella CKM-mirrorn direkt — separat block eftersom källrepot skiljer sig:

```bash
cd infra/openehr/archetypes
BASE="https://raw.githubusercontent.com/regionstockholm/CKM-mirror-via-modellbibliotek/master/local/archetypes"
curl -fsSL "$BASE/entry/observation/openEHR-EHR-OBSERVATION.progress_note.v1.adl" -o openEHR-EHR-OBSERVATION.progress_note.v1.adl
curl -fsSL "$BASE/composition/openEHR-EHR-COMPOSITION.encounter.v1.adl"           -o openEHR-EHR-COMPOSITION.encounter.v1.adl
shasum -a 256 openEHR-EHR-OBSERVATION.progress_note.v1.adl openEHR-EHR-COMPOSITION.encounter.v1.adl
```

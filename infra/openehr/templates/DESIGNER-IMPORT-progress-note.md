# Manuell OPT-import: progress_note.v1 via tools.openehr.org/designer

**Varför manuellt:** `pnpm openehr:compile` är i diagnostic mode (P3.0b, AOM→XML-OPT-bridgen
är inte klar) — den validerar ADL men producerar ingen OPT. De befintliga templatesen
(`medication_summary.v1` m.fl.) kringgår detta med programmatiska TS-bridge-builders
(`services/openehr-composer/src/bridge/`), men den vägen kräver att någon i förväg känner
den exakta RM-strukturen väl nog att skriva XML för hand. För en tvåarketyps-komposition
med öppen content-slot (se nedan) är den etablerade openEHR-branschverktygskedjan — manuell
byggnad i Template Designer — snabbare och mindre felbenägen. Detta dokumenterades som ett
undantag redan vid Grind 1 (punkt c): "manuella designer-steget dokumenteras reproducerbart
i README, OPT checkas in med mirror-SHA-proveniens."

Detta är ett **engångsundantag** från regeln i `README.md` i denna mapp ("ändra inte
OPT-filer direkt, de genereras") — `progress-note-v1.opt` är inte regenererbar av
`pnpm openehr:compile` förrän P3.0b landar. När den bron finns ska denna fil regenereras
därifrån och detta dokument arkiveras.

## Källarketyper (redan i repot, redan validerade)

| Roll | Arketyp | UID | ADL-fil |
|---|---|---|---|
| Root (COMPOSITION) | `openEHR-EHR-COMPOSITION.encounter.v1` | `52fa2b9c-ed55-4821-a300-1150fb382c05` | `../archetypes/openEHR-EHR-COMPOSITION.encounter.v1.adl` |
| Content (OBSERVATION) | `openEHR-EHR-OBSERVATION.progress_note.v1` | `4c1c083f-70e1-4359-8ea2-07cafca0be0f` | `../archetypes/openEHR-EHR-OBSERVATION.progress_note.v1.adl` |

Båda validerade `read_status: OK` av `pnpm openehr:compile` (diagnostic mode) —
se `compiler-diagnostic-report.md` i denna mapp. Full källprovenans (CKM-mirror, commit-SHA,
SHA256, licens) i `../archetypes/PROVENANCE.md`, avsnitten för dessa två filer.

**Strukturellt facit (läst direkt ur ADL:en, så du kan verifiera att Designer byggt rätt):**

`COMPOSITION.encounter.v1` (rad 462–485) begränsar bara `category` (auto-bunden till
`openehr::433`, kräver ingen åtgärd) och en valfri extension-cluster i `context/other_context`
(hoppa över — inte relevant för demo). **`content`-attributet är helt öppet på
arketyp-nivå** — encounter.v1 lägger ingen egen slot-constraint på den, vilket betyder att
Designer ska tillåta att du droppar in `progress_note.v1` direkt i content utan att
arketyperna "krockar" om slot-typ.

`OBSERVATION.progress_note.v1` (rad 132–163) har exakt **ett** datafält som spelar roll:

```
OBSERVATION[at0000] "Progress note"
  data → HISTORY[at0001] "Event Series"
    events → EVENT[at0002] (0..*) "Any event"
      data → ITEM_TREE[at0003] "Tree"
        items → ELEMENT[at0004] (0..1) "Progress Note" — värdetyp DV_TEXT
  protocol → ITEM_TREE[at0005] "Tree" (bara en valfri extension-cluster, at0006 — hoppa över)
```

`at0004` ("Progress Note", DV_TEXT) är fritextfältet för själva anteckningen — det enda
fältet som måste vara med i templatet. **Ingen svensk översättning finns i mirrorn** för
progress_note.v1 (bekräftat i PROVENANCE.md) — fältetiketten blir engelsk "Progress Note"
i Designer och i exporterad OPT tills en svensk översättning bidrags uppströms. Detta är
känt och redan flaggat, inte ett fel i din import.

## Steg-för-steg i tools.openehr.org/designer

Exakta knappnamn kan skilja mellan Designer-versioner — leta efter motsvarande funktion om
texten nedan inte matchar exakt.

1. **Logga in** (Google/Microsoft/GitHub — detta är precis det steg jag inte utför å dina
   vägnar).

2. **Skapa nytt template.** I din workspace: "Create New Template" (eller motsvarande).
   Ge det ett arbetsnamn, t.ex. "Progress note (Nimloth Compose)".

3. **Sätt root-arketyp = `openEHR-EHR-COMPOSITION.encounter.v1`.**
   - Sök först i Designers inbyggda arketyp-katalog (indexerar vanligen internationella CKM).
   - **Verifiera UID:** om katalogversionen har UID `52fa2b9c-ed55-4821-a300-1150fb382c05`
     är det samma revision som vår lokala fil — använd den.
   - Om UID skiljer sig, eller om katalogversionen saknar den svenska `["sv"]`-översättningen
     (den är själva anledningen till att vi hämtade just denna fil från Modellbiblioteket-
     mirrorn i stället för direkt från internationella CKM — se PROVENANCE.md), använd i
     stället Designers "Upload archetype" / "Import ADL" / "Import custom archetype"-funktion
     (vanligtvis i sidopanelen under "My Archetypes" eller liknande) och ladda upp
     `../archetypes/openEHR-EHR-COMPOSITION.encounter.v1.adl` direkt från disk.

4. **Lägg till `openEHR-EHR-OBSERVATION.progress_note.v1` i `content`.**
   - Samma UID-verifiering: `4c1c083f-70e1-4359-8ea2-07cafca0be0f`. Ladda upp
     `../archetypes/openEHR-EHR-OBSERVATION.progress_note.v1.adl` manuellt om katalogversionen
     inte matchar (den gör troligen inte det — progress_note.v1 finns bara via
     Modellbiblioteket-mirrorn, se PROVENANCE.md).
   - Dra/lägg till den som ett content-item under composition-roten. Eftersom `content` är
     obegränsat på arketyp-nivå (se ovan) ska Designer inte protestera på typen.
   - **Occurrences: sätt till 1..1** (inte 0..* eller 0..1) — varje anteckning i demot är
     sin egen komposition (samma mönster som övriga event i data-generatorn: en komposition
     per händelse, inte flera anteckningar packade i samma komposition).

5. **Fältval:**
   - `ELEMENT[at0004]` ("Progress Note", fritext) — **måste vara med**, detta är
     anteckningstexten.
   - `protocol`-trädet (ITEM_TREE[at0005]/extension-clustret at0006) — **uteslut**, inte
     relevant för demot.
   - `context/other_context`-extensionen i encounter.v1 — **uteslut** av samma skäl.
   - `category` (openehr::433) — lämna som är, kräver ingen manuell åtgärd.

6. **Metadata:**
   - **Template ID:** `progress_note.v1` (följer den lokala konventionen —
     `medication_summary.v1`, `laboratory_test_result.v1` är namngivna efter
     content-arketypens koncept, inte efter composition-omslaget).
   - **Språk:** `sv` (primärt), `en` (default/fallback).
   - **Description/concept:** t.ex. "Klinisk anteckning — vårdkontakt med fritextnot"
     eller motsvarande.

7. **Exportera som OPT — ADL 1.4-formatet specifikt** (inte "OPT 1.4 flat", inte ADL2/RM 2.0
   om Designer erbjuder flera format). Det är samma format `load-templates.mjs` POSTar mot
   `POST {EHRBASE_URL}/ehrbase/rest/openehr/v1/definition/template/adl1.4`.

8. **Spara filen som:**
   ```
   infra/openehr/templates/progress-note-v1.opt
   ```
   (Filnamnskonventionen i denna mapp är dash-separerad — `<koncept>-<variant>.opt` —
   se `README.md` här, medan `template_id` inuti XML:en är `progress_note.v1` med punkt.
   Det är avsiktligt olika konventioner, inte ett misstag.)

## Efter export — resten av kedjan (jag tar över här)

Skicka mig OPT-filen (eller bara säg till när den ligger på plats i
`infra/openehr/templates/progress-note-v1.opt`) så gör jag:

1. `pnpm openehr:load-templates` — POSTar till lokal EHRbase, verifierar HTTP 201/409.
2. Bygger AQL-mallen för `se.nimloth.aql.notes_recent` i `aql-template-service` (parametrisk
   på `patient_id`, projicerar `at0004`-texten + tidsstämpel).
3. Registrerar mallen i katalogen så `note-list-view`-komponentens manifest pekar rätt.
4. Verifierar end-to-end: syntetisk anteckningsdata genererad → laddad → sökbar via AQL →
   synlig i Studios förhandsgranskning för Maria.
5. Committar OPT-filen med provenance-not (mirror-SHA för källarketyperna, redan i
   PROVENANCE.md, + not om att OPT:en är manuellt byggd tills P3.0b-bridgen finns).

# Spec: B6 Etapp 1 — HbA1c-kedjan

**Status:** ✅ Godkänd och kört, 2026-09-14.
**OBS — retroaktivt exempel:** denna spec skrevs INNAN `intake/`/`spec/`-
strukturen fanns. Fullständig originalversion (inkl. revisionslogg) ligger
i `nimloth-docs/Spec_B6_Etapp1_HbA1c_Kedjan_v0.1.md` och resultatrapporten
i `nimloth-docs/KU_B6_Etapp1_Rapport.md` — den här filen är en kondenserad
spegling i det nya formatet, som konkret exempel för framtida specar.

## 1. Ursprung

Inget `intake/`-underlag — kom istället från att en tidigare skriven
prompt (`Prompt_B6_Etapp1_HbA1c_Kedjan_2026-08-20`) inte gick att
återfinna i git under discovery-utredningen 2026-09-14. Specen skrevs om
från grunden, grundad i verifierat nuläge snarare än den saknade prompten.

## 2. Nuläge (verifierat, inte antaget)

Ingrids två lineage-spårade HbA1c-mätningar (54→52 mmol/mol) fanns kvar,
intakta, i `core-db` på Moria — men bara 4 av 114 318 rader i
`omop.measurement` hade `_source='live_transform'` (riktig lineage);
resten var bulk-`preloaded`. `omop-projector` var ett batch-CLI-jobb
(AQL-pull direkt mot EHRbase), senast kört 2026-08-13.

## 3. Mål

1. Bevisa att kedjan (EHRbase-komposition → `omop-projector` → OMOP med
   lineage) fortfarande fungerar live, inte bara att gammal data ligger kvar.
2. Generalisera bortom "bara Ingrid" — samma väg för en till patient.

## 4. Acceptanskriterier

1. Ny komposition → `omop.measurement` med `_source='live_transform'` +
   giltig `_source_composition_uid`.
2. Idempotent — Ingrids befintliga rader oförändrade.
3. `hba1c-above-threshold`-AQL-mallen hittar båda patienterna vid rätt
   tröskel, och en negativ kontroll (tröskel över båda värdena) ger 0 rader.
4. En rapport som uttalar `_source`-fördelningen (demo-ärlighet).
5. `/opt/nimloth-core` (compose/images) och fru-andersson-slice orörda.

**Resultat:** alla 5 gröna. Se `nimloth-docs/KU_B6_Etapp1_Rapport.md` för
exakta kommandon, SQL-verifiering och AQL-svar.

## 5. Uttryckligen utanför scope

Ingen FHIR-yta, ingen kvalitetsregister-export, de 114 314 `preloaded`-
raderna rördes inte, `omop-projector` gjordes inte om till en kontinuerlig
tjänst, ingen deploy/CI-ändring.

## 6. Öppna frågor (fördes vidare, inte lösta här)

1. Syns `_source` i dashboard-UI:t? → blev **B6 Etapp 2**, se
   `../backlog/stories/B6-etapp2-source-honesty-ui.md`.
2. Vart tar Kafka-lab-eventen (`core.clinical.lab.result`) egentligen
   vägen, om inte till `omop-projector`? → olöst, ingen story ännu.
3. Hårdkodade CarliusFyra-IP:er (`192.168.1.189`) som fallback-default i
   `data-generator`/`omop-projector`s config → olöst, ingen story ännu.

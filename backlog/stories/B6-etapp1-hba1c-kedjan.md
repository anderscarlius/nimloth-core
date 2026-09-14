# Story: B6 Etapp 1 — HbA1c-kedjan

**Modul:** `omop-projector`, `aql-template-service`, `data-generator` (läs/körning, ingen kodändring i någon av dem)
**Spec:** `../../spec/B6-etapp1-hba1c-kedjan.md`
**Status:** ✅ done (2026-09-14)
**Gate-nivå:** `medium_risk` — skrev till en redan körande tjänst (EHRbase/`core-db` på Moria), men additivt och idempotent, ingen `--reset`/TRUNCATE använd.

## Vad som gjordes

1. Ny syntetisk patient seedad i EHRbase på Moria (`data-generator`s
   befintliga `SEED_PATIENT_ID`-override, ingen kodändring behövdes).
2. `omop-projector` kört mot samma patient (via SSH-tunnel till `core-db`,
   som bara är bunden till `127.0.0.1` på Moria).
3. `hba1c-above-threshold`-AQL-mallen testad mot båda patienterna +
   en negativ kontroll.

## Acceptans

Alla 5 kriterier i specen gröna — se `nimloth-docs/KU_B6_Etapp1_Rapport.md`
för fullständiga kommandon och verifieringsdata.

## Ingen kod skrevs

Detta var en **verifieringsstory**, inte en byggstory — allt som behövdes
fanns redan (seed-override, batch-projector, AQL-mall). Det är därför
story:n inte har någon egen PR i nimloth-core — bara dokumentation i
nimloth-docs och (retroaktivt) denna backlog-post.

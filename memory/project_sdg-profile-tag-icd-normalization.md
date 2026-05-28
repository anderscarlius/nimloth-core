---
name: sdg-profile-tag-icd-normalization
description: Bara diabetes_typ2→E11 är ICD-normaliserad. Övriga single-condition-profil-taggar (hypertoni→I10, hjärtsvikt→I50, kol→J44) kodar fortfarande profilNAMNET som diagnoskod. Ofarligt idag, fix-när-konsumerad — samma princip som E11.
metadata:
  type: project
---

# Profil-tagg som diagnoskod — bara diabetes_typ2 är normaliserad

## Skulden

`PROFILE_PRIMARY_ICD` i [PathwayEngine.ts](services/data-generator/src/engine/PathwayEngine.ts)
normaliserar **endast** `diabetes_typ2` → **E11** (Fas 1 SDG-10). De övriga
single-condition-profilerna skriver fortfarande **profilNAMNET** in i
diagnoskod-fältet på `problem_diagnosis.v1`, i stället för en äkta ICD-kod:

| Profil-tagg (idag i diagnoskod) | Borde vara (ICD-10) |
|---|---|
| `hypertoni` | I10 |
| `hjärtsvikt` | I50 |
| `kol` | J44 |
| (ev. fler single-condition-profiler) | resp. äkta ICD |

(Separat spår: `aldre_multisjuk` är ett profil-*namn* i diagnoskod-fältet — se
[[sdg-fork-4-comorbidity]]. Detta gäller single-condition-profilerna.)

## Varför ofarligt IDAG

**Ingen befordrad (tier=honest) mall nyckar på de här koderna.** AQL-01/06/11 och
Fas 2-mallarna nyckar på E11 (diabetes) resp. ICD-prefix-mönster (`/^[A-Z]\d/`),
aldrig på `hypertoni`/`hjärtsvikt`/`kol`-strängarna. Med-review-regelmotorerna
(Fas 3) bedömer på **ATC** (läkemedel) + allergi-koder, inte på diagnoskoder. Så
ingen konsument läser dessa fält idag → ingen felklassificering uppstår.

## Fix-när-konsumerad (samma princip som E11)

Samma mönster som diabetes_typ2→E11: utöka `PROFILE_PRIMARY_ICD` med en
ICD-mappning per single-condition-profil, regenerera (destruktiv — guard +
cross-query-disciplin), re-baseline karaktäriseringssnapshot (S5). Bygg det när
en konsument (mall eller regelmotor) faktiskt frågar på dessa diagnoser — inte
spekulativt. Lyft det tillsammans med en sådan konsuments demo-beat.

## Cross-query-disciplin vid fix

En ny ICD-normalisering är ärlig för sin egen profil men MÅSTE kollas mot
dropout/diabetes-frågorna (AQL-01/06) så inget oavsiktligt nyckar in — samma
triad-disciplin som metformin→E11 (se [[med-review-fas3]],
[[template-honesty-conflation]]).

Relaterat: [[sdg-fork-4-comorbidity]] (aldre_multisjuk-proxy), [[med-review-fas3]]
(E11-triaden + cross-query), [[sdg-10-amendments]].

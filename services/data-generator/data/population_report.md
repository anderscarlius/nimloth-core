# SDG-07 — Populationsrapport

Genererad: 2026-05-21T22:12:30.229Z
EHRbase: http://192.168.1.189:11401/ehrbase

## Sammanfattning

- Patienter (manifest): **1101**
- Compositions (manifest): **10411**
- AQL COUNT(EHR): 1104
- AQL COUNT(COMPOSITION): 10471
- Fel-events: 0
- Spot-check 50 slumpmässiga: 50/50 OK (100%)

## Per profil

| Profil | Patienter | Compositions | Fel |
|---|---:|---:|---:|
| aldre_multisjuk | 211 | 2988 | 0 |
| diabetes_typ2 | 110 | 1048 | 0 |
| hypertoni | 130 | 1200 | 0 |
| hjartsvikt | 90 | 939 | 0 |
| kol | 90 | 738 | 0 |
| anemi | 80 | 684 | 0 |
| uvi | 110 | 908 | 0 |
| depression | 100 | 830 | 0 |
| brostsmarta | 90 | 590 | 0 |
| ryggsmarta | 90 | 486 | 0 |

## Marianne Lindqvist

- ehr_id: `7d1eb30e-dcf6-4570-a992-603aa1b95802`
- patient_id: `marianne-lindqvist-syn-001`
- Compositions: 11
- Seed: 42
- Laddad: 2026-05-21T21:53:17.144Z

## Acceptanskriterier (SDG-07)

| AC | Krav | Status |
|---|---|---|
| AC-01 | Exakt 1 000 unika ehr_id | ❌ (1101) |
| AC-02 | Minst 8 000 compositions totalt | ✅ (10471) |
| AC-03 | Marianne >= 10 compositions | ✅ (11) |
| AC-04 | Manifest har ehrId+profileId+seed | ✅ |
| AC-05 | Spot-check >= 98% OK | ✅ (100%) |
| AC-06 | Ingen profil har 0 patienter | ✅ |

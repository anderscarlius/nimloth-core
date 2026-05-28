---
name: med-review-fas3
description: Fas 3 AI-medicineringsgenomgång (Fork 4) — regelmotor-ryggrad som regulatorisk gräns, syntes-validering som gör S1 verifierad ej prompt-beroende, co-location-falsifiering, stegad hämtning = en mekanism. Demons nyttolast är kontrasten deterministiska-fynd | bunden-LLM-syntes.
metadata:
  type: project
---

# Fas 3 — AI-medicineringsgenomgång (Fork 4): beslut & körnings-lärdomar

Tjänst: `services/med-review` (container `med-review-core`, cf4 LAN-port 11403),
SSE-orkestrator + deterministiska regelmotorer + LLM-syntes. UI: `/med-review`
(tre kolumner: patientdata | fynd+narrativ | audit-tidslinje).

## De fem grindarna (S1–S5)

- **S1 — LLM ur beslutsvägen (regulatorisk ryggrad).** ALL klinisk bedömning görs
  av deterministiska regelmotorer (`runRules`) mot publicerade kriterier, med
  källa. LLM:en *orkestrerar* (fast pipeline) + *syntetiserar* (narrativet) — den
  fattar inga beslut. Det är detta som håller demon utanför MDR Rule 11 /
  EU AI Act high-risk. **S1 är nu VERIFIERAD, inte bara hävdad** — se
  syntes-valideringen nedan.
- **S2 — fynd & narrativ är deskriptiva, aldrig imperativa.** "ge X / sätt ut Y"
  är förbjudet. Ej-medicinteknisk-märkningen påförs alltid (header-badge +
  syntes-svans), även om LLM utelämnar den.
- **S3 — syntetisk data only.** Ankarpersonerna (SDG-09/10), 1000 EHR.
- **S4 — audit per dataaccess.** Ett `audit`-event per AQL-anrop (mall, patient,
  radantal, ms, tid). 4 dataaccesser per genomgång, synliga i audit-tidslinjen =
  PDL-spårbarhet.
- **S5 — re-baseline-disciplin.** Karaktäriseringssnapshot ändras medvetet, inte
  av drift (`vitest run -u`), och bara där det är avsett.

## A/B — ankar-härledning (bekräftat med Anders)

- **A (Ingrid):** penicillinallergi (`adverse_reaction_risk.v2`, J01CE, high,
  anafylaxi) + aktiv amoxicillin (J01CA04) → **direkt kontraindikation**. Regeln
  resonerar från registrerad reaktionstyp + läkemedelsKLASS (`J01C*`), inte naken
  sträng-match — därav "DIREKT KONTRAINDIKATION (high)".
- **B (Marianne):** fynden härleds STRIKT ur hennes 8 mediciner, INGEN diabetes
  påklistrad. Warfarin (B01AA03) + sertralin (N06AB06) → blödningsrisk-interaktion
  (high) + Beers (warfarin-äldre) + STOPP (SSRI-äldre).

## Regelmotor-ryggraden = den regulatoriska gränsen

`runRules` (ren funktion, ingen I/O, inget LLM) ÄR den kliniska bedömningsvägen.
Att skala regelmotorn = lägga till **data** (fler kriterie-rader), inte **logik**.
Beers/STOPP-checkern är en medvetet **scopad delmängd**, explicit märkt — inte
hela banken. Interaktionstabellen är kuraterad (Janusmed + publicerade studier).

## Syntes-beslutet + VARFÖR (AC7:s kärna)

Demons nyttolast är **kontrasten**: deterministiska, källbelagda fynd | bunden
LLM-syntes som bara omformulerar. Den kontrasten måste **visas**, inte hävdas.

Syntes-beslutet hade tre delar:
1. **Bunden prompt** — systemprompten förbjuder bedömningar/rekommendationer.
2. **Output validerad mot fynden** — `synthesis-validator.ts`. ← den som gör S1
   verifierad i stället för prompt-beroende.
3. **Deterministisk fallback** — offline / API-fel / avvisad syntes → `deterministicNarrative`.

**Varför (2) är icke-förhandlingsbar:** en prompt är en INSTRUKTION, inte en
garanti. Vi byggde en env-switch (`MED_REVIEW_SYNTH_MODEL`) som flippar
Opus↔Haiku — en modell-swap är precis vad som kan ändra drift-beteende. Utan
validering kan en mindre modell (eller en framtida prompt-redigering) tyst smyga
in ett osourcerat kliniskt påstående — "överväg att sänka warfarindosen" — i
klinikertexten, och **S1 bryts utan att någon märker det**. Valideringen vänder
LLM:en från risk till **säkerhetsbevis**: den får skriva prosan, varje kliniskt
påstående valideras mot den deterministiska motorn.

Validatorn (försvar-på-djupet, två DETERMINISTISKA kontroller — ej semantiskt bevis):
- **(1) Beslutsspråk** i LLM:ens egen röst (överväg / sätt ut-in / dosändring /
  byt ut / förskriv / remittera / "bör/ska + åtgärd"). **Gated av korpus-
  subtraktion:** en fras som ordagrant finns i fynden är källförankrad och
  flaggas inte. (Live-bevis: Claude återgav "STOPP omprövning/de-eskalering" för
  Ingrid utan att felaktigt avvisas.)
- **(2) Ogrundad motor-känd läkemedelsreferens** (sluten värld): nämner narrativet
  ett motor-känt läkemedel som inte finns i de aktuella fynden → avvis.
- Vid avvis → deterministisk fallback + synlig flagga (`synthesis_rejected`-event,
  rosa banner, step-label "Syntes avvisad (S1-skydd)"). Den förkastade texten
  bevaras (`rejectedText`) för audit.
- Verifierat: `synthesis-validator.test.ts` (5) + `synthesis.test.ts` (3, bevisar
  att validatorn är WIRED via injicerbar `RawGenerate`, ej bara existerar). Det
  test Anders bad om — injicera "överväg att sänka warfarindosen", bekräfta fångst.

## Co-location-FALSIFIERINGEN (skyddar nästa agent)

Hypotesen att co-location (med-review + aql-template bredvid EHRbase, loopback)
skulle fixa latensen var **FALSK** (AC1-benchmark: P95 578ms loopback vs 502ms
LAN vid 8 parallella). **Topologi var inte latens-spaken.** Flaskhalsen är
EHRbase-samtidighet på en 4-kärnig NAS. Den **riktiga spaken är bounded/stegad
hämtning** (3–4 sekventiella frågor, inte 8 parallella). Co-location behölls som
golv-förbättring + intern säkerhet — inte som latensfix.

Live-bevis (AC7, co-located): stegad hämtning = **205 ms** total (4 datasteg:
39/35/56/75 ms). Total genomgång 9157 ms — dominerad av Claude-syntes (~8950 ms
över internet, EJ co-location-beroende). Datalagret är trivialt; agentens
vägg-klocka ÄR LLM:en.

**Lärdom för nästa agent:** grip inte efter co-location för att lösa latens.
Mät först — bounded concurrency mot en delad single-node-DB är spaken.

## Stegad hämtning = bounded concurrency = streaming = EN mekanism

Orkestratorn hämtar sekventiellt: medications → diagnoses → trend → allergies.
Samma mekanism ger (a) bounded concurrency (ingen wide fan-out som återinför
latensproblemet), (b) streaming-UX (kolumn 1 fylls stegvis), (c) audit-beats (ett
spår per steg). En mekanism, tre nyttor — inte tre system.

## Metformin→E11-triaden + cross-query-disciplinen

`deriveComorbidities` (gated till aldre_multisjuk) ger metformin-bärare E11 +
EN HbA1c-övervakningslab = "triaden", för att undvika falsk dropout-flaggning.
**Disciplin:** en ändring som är ärlig för AQL-01 (E11-diabetesräkning) MÅSTE
kollas mot AQL-06 (dropout). Triaden höll: AQL-06 = 11 (≈9% diabetiker + Anders-
ankaret), 0 av metformin-bärarna feldroppade. Se [[template-honesty-conflation]].

## ÖPPET — spårat, ej begravt

- **Exakta Beers/STOPP-kriterie-ID:n (Anders-beroende).** Demon skeppas med
  primärkälla + sektion + DOI:
  - Beers 2023: J Am Geriatr Soc 2023;71(7):2052-2081, **doi:10.1111/jgs.18372**
  - STOPP/START v3: O'Mahony 2023, Eur Geriatr Med 2023;14:625-632,
    **doi:10.1007/s41999-023-00777-y**
  De alfanumeriska kriterie-ID:na (STOPP K-kod / Beers-tabellrad) byts in när
  primärpapperen är i hand — de GISSAS INTE (sekundärkällor motsade varandra och
  kan inte verifieras utan primärtext). `beers-stopp.ts` bär detta som markerad
  öppen punkt, inte tyst TODO.
- **Validatorns gräns:** kontroll (2) är sluten värld — fångar inte påhittade
  läkemedel utanför motorns vokabulär (mitigeras av kontroll 1 + bunden prompt +
  kort max_tokens). En framtida förstärkning: NER mot en bred läkemedelslexikon.

## Säkerhet / drift

- Co-location är **INTERN** (docker-nät `core`) — INGEN publik tunnel förrän
  mock-auth-skulden är åtgärdad. Intern co-location triggar inte den skulden.
- `ANTHROPIC_API_KEY` finns i cf4-env (refereras `${ANTHROPIC_API_KEY:-}`).
  Echo:a ALDRIG nyckelvärdet.
- Synology: ingen SCP (tar+pipe över ssh), `docker-compose` =
  `/usr/local/bin/docker-compose`, docker under ContainerManager-sökväg, `set +e`.

Relaterat: [[template-honesty-conflation]] (mall-ärlighet, cross-query),
[[sdg-fork-4-comorbidity]] (tier-befordringsgräns, comorbiditeter),
[[sdg-10-amendments]] (adverse_reaction → Fas 3, INVARIANT 1/2).

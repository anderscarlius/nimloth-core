// Beers/STOPP-checker (Fas 3 AC4) — SCOPAD DELMÄNGD.
//
// Komplett regelmotor, scopad DATA: kriterierna nedan täcker demo-patienternas
// läkemedel. Detta är INTE hela Beers 2023 / STOPP v3-banken — det är en
// medveten delmängd, explicit märkt. Att skala = lägga till data, inte logik.
//
// Deterministisk, LLM-fri, testbar. Varje kriterium citerat.
//
// KÄLL-STATUS (AC7 — SPÅRAT ÖPPET, ej tyst TODO):
// Demon skeppas med PRIMÄRKÄLLA + SEKTION + DOI (korrekt, ärligt, försvarbart
// inför klinisk publik under "granska"-framingen):
//   - Beers 2023:    J Am Geriatr Soc 2023;71(7):2052-2081, doi:10.1111/jgs.18372
//   - STOPP/START v3: O'Mahony 2023, Eur Geriatr Med 2023;14:625-632,
//                     doi:10.1007/s41999-023-00777-y
// ÖPPET (Anders-beroende): de EXAKTA alfanumeriska kriterie-ID:na (t.ex. STOPP
// K-kod / Beers-tabellrad) byts in när primärpapperen är i hand. De gissas INTE
// här — sekundärkällor motsade varandra om koderna och kan inte verifieras utan
// primärtexten. Detta är spårat i memory (project_med-review-fas3.md) som
// känt-öppet, inte begravt som kod-TODO. Regel-logiken är klar och oberoende.

import type { Finding, PatientSnapshot, Source } from "./types.js";

const ELDERLY_AGE = 65;

interface GeriatricRule {
  id: string;
  /** Matcha läkemedel vars ATC börjar med detta prefix. */
  atcPrefix: string;
  severity: Finding["severity"];
  title: string;
  mechanism: string;
  consequence: string;
  clinicalNote: string;
  sources: Source[];
}

// Scopad delmängd — träffar demo-patienternas mediciner (warfarin, SSRI, PPI).
const GERIATRIC_RULES: GeriatricRule[] = [
  {
    id: "beers.anticoagulant_elderly",
    atcPrefix: "B01AA", // warfarin (B01AA03)
    severity: "moderate",
    title: "Warfarin hos äldre — förhöjd blödningsrisk + INR-labilitet",
    mechanism:
      "Vitamin-K-antagonist med smalt terapeutiskt fönster; INR-labilitet ökar med ålder, läkemedelsinteraktioner och njurfunktion.",
    consequence:
      "Förhöjd blödningsrisk hos äldre. Beers listar antikoagulantia bland läkemedel som kräver särskild försiktighet/övervakning.",
    clinicalNote:
      "Klinisk kontext: regelbunden INR-uppföljning och blödningsanamnes är relevant hos äldre.",
    sources: [
      {
        label: "Beers 2023 (AGS)",
        ref: "J Am Geriatr Soc 2023;71(7):2052-2081, doi:10.1111/jgs.18372 — sektion: läkemedel som ska användas med försiktighet (antikoagulantia). Exakt tabellrad öppet (verifieras mot primärtabell).",
      },
    ],
  },
  {
    id: "stopp.ssri_elderly",
    atcPrefix: "N06AB", // SSRI (sertralin N06AB06)
    severity: "moderate",
    title: "SSRI hos äldre — hyponatremi- och fallrisk",
    mechanism:
      "SSRI associeras med SIADH/hyponatremi och ökad fallrisk hos äldre; vid samtidig antikoagulation additiv blödningsrisk (jfr separat interaktionsfynd).",
    consequence:
      "Hyponatremi, yrsel, fall. STOPP flaggar SSRI vid samtidig hyponatremi-risk eller blödningsbenägenhet.",
    clinicalNote:
      "Klinisk kontext: natrium-kontroll och fallriskbedömning är relevanta hos äldre på SSRI.",
    sources: [
      {
        label: "STOPP/START v3",
        ref: "O'Mahony 2023, Eur Geriatr Med 2023;14:625-632, doi:10.1007/s41999-023-00777-y — CNS/psykofarmaka-sektionen, SSRI vid hyponatremi-/fallrisk. Exakt kriterie-ID öppet.",
      },
    ],
  },
  {
    id: "stopp.ppi_prolonged",
    atcPrefix: "A02BC", // PPI (omeprazol A02BC01, lansoprazol A02BC03)
    severity: "low",
    title: "PPI i full dos — ompröva vid >8 veckors behandling",
    mechanism:
      "Protonpumpshämmare i full terapeutisk dos bortom 8 veckor utan kvarstående indikation; långtidsbruk associeras med bl.a. frakturrisk och B12-/magnesiumbrist.",
    consequence:
      "Onödig långtidsexponering. STOPP rekommenderar omprövning/de-eskalering vid utebliven indikation.",
    clinicalNote:
      "Klinisk kontext: indikationen för fortsatt PPI är relevant att ompröva.",
    sources: [
      {
        label: "STOPP/START v3",
        ref: "O'Mahony 2023, Eur Geriatr Med 2023;14:625-632, doi:10.1007/s41999-023-00777-y — GI-sektionen, PPI i full terapeutisk dos >8 veckor. Exakt kriterie-ID öppet.",
      },
    ],
  },
];

export function checkBeersStopp(snapshot: PatientSnapshot): Finding[] {
  // Geriatriska kriterier gäller äldre. Saknas ålder antas demo-ankare (äldre).
  const age = snapshot.age ?? ELDERLY_AGE;
  if (age < ELDERLY_AGE) return [];

  const findings: Finding[] = [];
  for (const rule of GERIATRIC_RULES) {
    const matches = snapshot.activeMedications.filter((m) =>
      m.atc.toUpperCase().startsWith(rule.atcPrefix),
    );
    for (const med of matches) {
      findings.push({
        id: `${rule.id}:${med.atc}`,
        kind: "beers_stopp",
        severity: rule.severity,
        title: rule.title,
        involved: [med.atc],
        mechanism: rule.mechanism,
        consequence: rule.consequence,
        clinicalNote: rule.clinicalNote,
        sources: rule.sources,
      });
    }
  }
  return findings;
}

/** Exporterad för test/audit. Märkt delmängd. */
export const BEERS_STOPP_RULES = GERIATRIC_RULES;
export const IS_SCOPED_SUBSET = true;

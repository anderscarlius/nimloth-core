// Interaktions- + kontraindikations-checker (Fas 3 AC4).
//
// Statisk, kuraterad tabell — Janusmed (Region Stockholm) som primär svensk-
// relevant källa, kompletterat med publicerade studier/reviews. Scopad till de
// ATC som demo-patienterna bär. Deterministisk, LLM-fri, testbar.
//
// Källbeläggning (Anders, AC4): varje post bär mekanism + konsekvens + referens.

import type { Finding, PatientSnapshot, Source } from "./types.js";

interface PairwiseRule {
  id: string;
  atcA: string;
  atcB: string;
  severity: Finding["severity"];
  title: string;
  mechanism: string;
  consequence: string;
  clinicalNote: string;
  sources: Source[];
}

// --- Par-interaktioner (läkemedel × läkemedel) ---
const PAIRWISE: PairwiseRule[] = [
  {
    id: "interaction.warfarin_ssri",
    atcA: "B01AA03", // warfarin
    atcB: "N06AB06", // sertralin
    severity: "high",
    title: "Warfarin + SSRI (sertralin) — ökad blödningsrisk",
    mechanism:
      "Farmakodynamisk: SSRI hämmar serotoninupptag i trombocyter → försämrad trombocytaggregation, additivt till warfarins antikoagulation. Sertralin rapporterat förlänga protrombintiden ~5–8 %.",
    consequence:
      "Ökad blödningsrisk, särskilt gastrointestinal. Fall-kontrollstudier visar förhöjd odds för GI-blödnings-inläggning vid SSRI-insättning hos warfarin-patienter.",
    clinicalNote:
      "Kliniskt signifikant. Klinisk kontext: INR och blödningstecken är relevanta att följa.",
    sources: [
      { label: "Pharmacy Times", ref: "Trombocyt-serotonin-mekanismen" },
      { label: "Fall-kontrollstudie", ref: "PMC3123326" },
      { label: "Svensk registerstudie", ref: "PMC7239828" },
    ],
  },
  {
    id: "interaction.warfarin_amoxicillin",
    atcA: "B01AA03", // warfarin
    atcB: "J01CA04", // amoxicillin
    severity: "moderate",
    title: "Warfarin + Amoxicillin — INR-stegring",
    mechanism:
      "Amoxicillin stör vitamin-K-producerande tarmflora → minskat vitamin K → potentierar warfarin (som hämmar vitamin-K-beroende koagulationsfaktorer). EJ en CYP450-interaktion; effekten kan vara fördröjd (dagar in i/efter kuren).",
    consequence:
      "Förhöjt INR med blödningsrisk. Mer uttalad hos äldre och njurnedsatta.",
    clinicalNote:
      "Generellt måttlig. Klinisk kontext: INR-kontroll 3–5 dygn efter insättning är relevant.",
    sources: [
      { label: "Narrativ review", ref: "PMC10455514 (penicillin-derivat höjer INR)" },
      { label: "Fallrapport", ref: "Davydov 2003" },
      { label: "patient.info", ref: "Warfarin–amoxicillin" },
    ],
  },
];

// --- Kontraindikation: dokumenterad penicillinallergi + aktiv penicillin ---
// Amoxicillin (J01CA04) ÄR ett aminopenicillin. För dokumenterad typ-I
// (anafylaktisk) penicillinallergi är amoxicillin DIREKT kontraindicerat —
// samma läkemedelsklass, ingen cross-reactivity-bedömning behövs.
const PENICILLIN_CLASS_PREFIX = "J01C"; // beta-laktam-penicilliner (J01CA, J01CE, …)

function isPenicillinClass(atcOrCode: string): boolean {
  return atcOrCode.toUpperCase().startsWith(PENICILLIN_CLASS_PREFIX);
}

export function checkInteractions(snapshot: PatientSnapshot): Finding[] {
  const findings: Finding[] = [];
  const atcs = new Set(snapshot.activeMedications.map((m) => m.atc.toUpperCase()));

  // Par-interaktioner
  for (const rule of PAIRWISE) {
    if (atcs.has(rule.atcA) && atcs.has(rule.atcB)) {
      findings.push({
        id: rule.id,
        kind: "interaction",
        severity: rule.severity,
        title: rule.title,
        involved: [rule.atcA, rule.atcB],
        mechanism: rule.mechanism,
        consequence: rule.consequence,
        clinicalNote: rule.clinicalNote,
        sources: rule.sources,
      });
    }
  }

  // Kontraindikation: penicillinallergi + aktiv penicillin-klass-antibiotika
  const penicillinAllergies = snapshot.allergies.filter((a) =>
    isPenicillinClass(a.substanceCode),
  );
  if (penicillinAllergies.length > 0) {
    const activePenicillins = snapshot.activeMedications.filter((m) =>
      isPenicillinClass(m.atc),
    );
    for (const med of activePenicillins) {
      const allergy = penicillinAllergies[0];
      findings.push({
        id: "contraindication.penicillin_allergy",
        kind: "contraindication",
        severity: "high",
        title: `Penicillinallergi + aktiv ${med.name} — DIREKT KONTRAINDIKATION`,
        involved: [allergy.substanceCode, med.atc],
        mechanism: `${med.name} (${med.atc}) är ett penicillin (klass ${PENICILLIN_CLASS_PREFIX}*). Patienten har dokumenterad ${allergy.reactionType} mot ${allergy.substanceName} (kritikalitet: ${allergy.criticality}). Samma läkemedelsklass — ingen cross-reactivity-bedömning behövs.`,
        consequence:
          "Risk för anafylaxi vid återexponering för penicillin-klass-preparat.",
        clinicalNote:
          "Direkt kontraindikation vid dokumenterad typ-I-reaktion. Detta är ett kliniskt farligt fel en genomgång ska fånga.",
        sources: [
          { label: "StatPearls", ref: "NBK482250 (typ-I-reaktion = kontraindikation pga anafylaxirisk)" },
        ],
      });
    }
  }

  return findings;
}

/** Exporterad för test/audit: hela den kuraterade par-tabellen. */
export const PAIRWISE_INTERACTIONS = PAIRWISE;

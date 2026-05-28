import { describe, expect, it } from "vitest";
import { validateNarrative } from "../synthesis-validator.js";
import { runRules, type Finding } from "../rules/index.js";

// Realistiska fynd via den deterministiska motorn (samma väg demon använder).
// Marianne-formen: warfarin + sertralin (+ PPI) hos äldre → interaktion + Beers/STOPP.
const marianneFindings: Finding[] = runRules({
  patientId: "marianne",
  age: 81,
  activeMedications: [
    { atc: "B01AA03", name: "Warfarin" },
    { atc: "N06AB06", name: "Sertralin" },
    { atc: "A02BC01", name: "Omeprazol" },
  ],
  allergies: [],
});

// Ingrid-formen: penicillinallergi + aktiv amoxicillin + warfarin.
const ingridFindings: Finding[] = runRules({
  patientId: "ingrid",
  age: 74,
  activeMedications: [
    { atc: "B01AA03", name: "Warfarin" },
    { atc: "J01CA04", name: "Amoxicillin 500 mg" },
  ],
  allergies: [
    { substanceCode: "J01CE", substanceName: "Penicillin", reactionType: "anafylaxi", criticality: "high" },
  ],
});

describe("syntes-validering (AC7) — S1 gjord verifierad, ej prompt-beroende", () => {
  it("godkänner ett källförankrat narrativ (endast fynd-grundade påståenden)", () => {
    const ok = [
      "Genomgång för Marianne: 3 fynd.",
      "Warfarin i kombination med SSRI (sertralin) ger ökad blödningsrisk.",
      "Warfarin hos äldre innebär förhöjd blödningsrisk och INR-labilitet.",
      "SSRI hos äldre associeras med hyponatremi- och fallrisk.",
      "Varje fynd har en angiven källa.",
      "Demonstration — ej medicinteknisk produkt, ej beslutsstöd.",
    ].join("\n");
    const r = validateNarrative(ok, marianneFindings);
    expect(r.ok).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  // DETTA är testet Anders bad om: mata in en syntes som introducerar ett
  // påstående utan motsvarande fynd, bekräfta att det fångas.
  it("FÅNGAR injicerad rekommendation utan motsvarande fynd ('överväg att sänka warfarindosen')", () => {
    const tampered = [
      "Warfarin + SSRI ger ökad blödningsrisk.",
      "Överväg att sänka warfarindosen och sätt ut sertralin.", // <- LLM-påhitt, ej i fynden
      "Demonstration — ej medicinteknisk produkt, ej beslutsstöd.",
    ].join("\n");
    const r = validateNarrative(tampered, marianneFindings);
    expect(r.ok).toBe(false);
    expect(r.violations.length).toBeGreaterThan(0);
    expect(r.violations.join(" ")).toMatch(/överväg|dos|sätt ut/i);
  });

  it("FÅNGAR ogrundad läkemedelsreferens (motor-känt läkemedel utanför fynden)", () => {
    // Marianne har inga metoprolol-fynd; om narrativet nämner det → ogrundat.
    const tampered = [
      "Warfarin + SSRI ger ökad blödningsrisk.",
      "Patienten står även på metoprolol vilket bidrar.", // metoprolol ej i något fynd
      "Demonstration — ej medicinteknisk produkt, ej beslutsstöd.",
    ].join("\n");
    const r = validateNarrative(tampered, marianneFindings);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/metoprolol/i);
  });

  it("källförankrad reproduktion av STOPP-formulering flaggas EJ (korpus-subtraktion)", () => {
    // PPI-fyndet bär 'rekommenderar omprövning/de-eskalering' — att återge det
    // är källförankrat och får inte felaktigt avvisas.
    const ppiFindings = runRules({
      patientId: "x",
      age: 80,
      activeMedications: [{ atc: "A02BC01", name: "Omeprazol" }],
      allergies: [],
    });
    const grounded =
      "PPI i full dos bortom 8 veckor: STOPP rekommenderar omprövning/de-eskalering vid utebliven indikation. Demonstration — ej medicinteknisk produkt.";
    const r = validateNarrative(grounded, ppiFindings);
    expect(r.ok).toBe(true);
  });

  it("godkänner Ingrids källförankrade kontraindikations-narrativ", () => {
    const ok = [
      "Penicillinallergi i kombination med aktiv Amoxicillin utgör en direkt kontraindikation.",
      "Warfarin + Amoxicillin kan ge INR-stegring.",
      "Warfarin hos äldre innebär förhöjd blödningsrisk.",
      "Demonstration — ej medicinteknisk produkt, ej beslutsstöd.",
    ].join("\n");
    const r = validateNarrative(ok, ingridFindings);
    expect(r.ok).toBe(true);
  });
});

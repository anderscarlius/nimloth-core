import { describe, expect, it } from "vitest";
import { runRules, checkInteractions, checkBeersStopp } from "../index.js";
import type { PatientSnapshot } from "../types.js";

// Marianne-lik: warfarin + sertralin + atorvastatin + amlodipin + ramipril +
// metoprolol + allopurinol (äldre). INGEN penicillin/amoxicillin.
const MARIANNE: PatientSnapshot = {
  patientId: "marianne",
  age: 81,
  activeMedications: [
    { atc: "B01AA03", name: "Warfarin" },
    { atc: "N06AB06", name: "Sertralin" },
    { atc: "C10AA05", name: "Atorvastatin" },
    { atc: "C08CA01", name: "Amlodipin" },
    { atc: "C09AA05", name: "Ramipril" },
    { atc: "C07AB02", name: "Metoprolol" },
    { atc: "M04AA01", name: "Allopurinol" },
  ],
  allergies: [],
};

// Ingrid-lik: metformin + simvastatin + omeprazol + warfarin + AKTIV amoxicillin,
// med dokumenterad penicillinallergi (J01CE).
const INGRID: PatientSnapshot = {
  patientId: "ingrid",
  age: 74,
  activeMedications: [
    { atc: "A10BA02", name: "Metformin" },
    { atc: "C10AA01", name: "Simvastatin" },
    { atc: "A02BC01", name: "Omeprazol" },
    { atc: "B01AA03", name: "Warfarin" },
    { atc: "J01CA04", name: "Amoxicillin" },
  ],
  allergies: [
    { substanceCode: "J01CE", substanceName: "Penicillin", reactionType: "allergy", criticality: "high" },
  ],
};

// Ren patient — ung, två icke-interagerande mediciner, ingen allergi.
const CLEAN: PatientSnapshot = {
  patientId: "clean",
  age: 40,
  activeMedications: [
    { atc: "C10AA05", name: "Atorvastatin" },
    { atc: "C09AA05", name: "Ramipril" },
  ],
  allergies: [],
};

describe("interactions — bär-beats", () => {
  it("Marianne: warfarin + sertralin flaggas (high, interaction)", () => {
    const f = checkInteractions(MARIANNE).find((x) => x.id === "interaction.warfarin_ssri");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("high");
    expect(f?.involved.sort()).toEqual(["B01AA03", "N06AB06"]);
    expect(f?.sources.length).toBeGreaterThan(0);
  });

  it("Ingrid: warfarin + amoxicillin flaggas (moderate, INR)", () => {
    const f = checkInteractions(INGRID).find((x) => x.id === "interaction.warfarin_amoxicillin");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("moderate");
  });

  it("Ingrid: penicillinallergi + amoxicillin = kontraindikation (high)", () => {
    const f = checkInteractions(INGRID).find((x) => x.id === "contraindication.penicillin_allergy");
    expect(f).toBeDefined();
    expect(f?.kind).toBe("contraindication");
    expect(f?.severity).toBe("high");
    expect(f?.involved).toContain("J01CA04");
    expect(f?.sources.some((s) => s.ref.includes("NBK482250"))).toBe(true);
  });

  it("CLEAN: inga interaktioner/kontraindikationer (inga falska positiva)", () => {
    expect(checkInteractions(CLEAN)).toHaveLength(0);
  });

  it("Marianne saknar penicillin → ingen kontraindikation (ingen falsk positiv)", () => {
    expect(checkInteractions(MARIANNE).some((f) => f.kind === "contraindication")).toBe(false);
  });
});

describe("beers/stopp — scopad delmängd", () => {
  it("Marianne (äldre): warfarin + SSRI ger geriatriska fynd", () => {
    const ids = checkBeersStopp(MARIANNE).map((f) => f.id);
    expect(ids.some((i) => i.startsWith("beers.anticoagulant_elderly"))).toBe(true);
    expect(ids.some((i) => i.startsWith("stopp.ssri_elderly"))).toBe(true);
  });

  it("Ingrid (äldre): PPI (omeprazol) ger STOPP-fynd", () => {
    const ids = checkBeersStopp(INGRID).map((f) => f.id);
    expect(ids.some((i) => i.startsWith("stopp.ppi_prolonged"))).toBe(true);
  });

  it("CLEAN (40 år, ej äldre): inga geriatriska fynd", () => {
    expect(checkBeersStopp(CLEAN)).toHaveLength(0);
  });

  it("varje fynd har minst en källa", () => {
    for (const f of [...checkBeersStopp(MARIANNE), ...checkInteractions(INGRID)]) {
      expect(f.sources.length).toBeGreaterThan(0);
    }
  });
});

describe("runRules — aggregering", () => {
  it("sorterar high före moderate före low", () => {
    const sev = runRules(INGRID).map((f) => f.severity);
    const rank = { high: 0, moderate: 1, low: 2 };
    for (let i = 1; i < sev.length; i++) {
      expect(rank[sev[i]]).toBeGreaterThanOrEqual(rank[sev[i - 1]]);
    }
  });

  it("Ingrid: kontraindikationen (high) finns med i aggregerade fynd", () => {
    expect(runRules(INGRID).some((f) => f.kind === "contraindication")).toBe(true);
  });
});

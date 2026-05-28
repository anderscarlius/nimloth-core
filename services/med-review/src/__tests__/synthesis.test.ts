import { describe, expect, it } from "vitest";
import { synthesize, type SynthInput } from "../synthesis.js";
import { runRules } from "../rules/index.js";

const findings = runRules({
  patientId: "marianne",
  age: 81,
  activeMedications: [
    { atc: "B01AA03", name: "Warfarin" },
    { atc: "N06AB06", name: "Sertralin" },
  ],
  allergies: [],
});
const input: SynthInput = { patientId: "marianne", medCount: 2, diagCount: 1, findings };

describe("synthesize() — valideringslagret är WIRED, inte bara existerande", () => {
  it("godkänner en källförankrad LLM-text (source=llm, validation.ok)", async () => {
    const grounded = () =>
      Promise.resolve(
        "Warfarin + SSRI (sertralin) ger ökad blödningsrisk. Warfarin hos äldre ger förhöjd blödningsrisk. SSRI hos äldre ger hyponatremi- och fallrisk.",
      );
    const r = await synthesize(input, undefined, grounded);
    expect(r.source).toBe("llm");
    expect(r.validation?.ok).toBe(true);
    expect(r.text).toContain("ej medicinteknisk"); // S2-märkning påförd
  });

  it("AVVISAR en LLM-text som smyger in en rekommendation → deterministisk fallback", async () => {
    // Simulerar exakt hotbilden: en (mindre/framtida) modell lägger till ett
    // osourcerat beslut. Validatorn ska fånga det och byta till deterministiskt.
    const tampering = () =>
      Promise.resolve("Warfarin + SSRI ökar blödningsrisken. Överväg att sätta ut sertralin.");
    const r = await synthesize(input, undefined, tampering);
    expect(r.source).toBe("deterministic");
    expect(r.validation?.ok).toBe(false);
    expect(r.rejectedText).toContain("sätta ut"); // den förkastade texten bevaras för audit
    expect(r.text).toContain("ej medicinteknisk"); // fallbacken bär ändå märkningen
  });

  it("offline (generator → null) faller tillbaka till deterministisk utan validering", async () => {
    const offline = () => Promise.resolve(null);
    const r = await synthesize(input, undefined, offline);
    expect(r.source).toBe("deterministic");
    expect(r.validation).toBeUndefined();
  });
});

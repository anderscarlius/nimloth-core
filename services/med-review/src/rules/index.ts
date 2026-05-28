import type { Finding, PatientSnapshot } from "./types.js";
import { checkInteractions } from "./interactions.js";
import { checkBeersStopp } from "./beers-stopp.js";

export * from "./types.js";
export { checkInteractions, PAIRWISE_INTERACTIONS } from "./interactions.js";
export { checkBeersStopp, BEERS_STOPP_RULES, IS_SCOPED_SUBSET } from "./beers-stopp.js";

const SEVERITY_RANK: Record<Finding["severity"], number> = { high: 0, moderate: 1, low: 2 };

/** Kör alla deterministiska regelmotorer mot patientögonblicksbilden och
 *  returnerar fynden sorterade efter allvarlighet (high först). Ren funktion —
 *  ingen I/O, inget LLM. Detta ÄR den kliniska bedömningsvägen (S1). */
export function runRules(snapshot: PatientSnapshot): Finding[] {
  const findings = [...checkInteractions(snapshot), ...checkBeersStopp(snapshot)];
  return findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

// Syntes-output-validering (Fas 3 AC7) — S1 GJORD VERIFIERAD, INTE PROMPT-BEROENDE.
//
// Bakgrund: synthesize() binder LLM:en via prompt ("omformulera bara, fatta inga
// beslut"). Men en prompt är en INSTRUKTION, inte en GARANTI. En modell-swap
// (env-switchen Opus↔Haiku) eller en framtida prompt-redigering kan tyst smyga in
// ett osourcerat kliniskt påstående — "överväg att sänka warfarindosen" — i
// klinikertexten, och S1 bryts utan att någon märker det.
//
// Den här validatorn är mekanismen som håller S1 ROBUST mot modell- och
// promptändringar: efter syntes kontrolleras att narrativet inte innehåller
// (1) beslutsspråk (imperativa/rekommenderande åtgärder) som klinikern ska fatta,
//     eller
// (2) läkemedelsreferenser som regelmotorn känner till men som INTE finns i de
//     aktuella fynden (ogrundad introduktion).
// Vid träff → narrativet AVVISAS och orkestratorn faller tillbaka till den
// deterministiska renderingen, synligt flaggat. LLM:en vänds därmed från risk
// till säkerhetsbevis: den får skriva prosan, men varje kliniskt påstående
// valideras mot den deterministiska motorn.
//
// ÄRLIG OMFÅNGSMÄRKNING: detta är försvar-på-djupet med två DETERMINISTISKA
// kontroller, inte ett semantiskt bevis. Kontroll (1) fångar beslutsspråk i
// LLM:ens egen röst (gated av korpus-subtraktion: en fras som ordagrant finns i
// fynden är källförankrad och flaggas inte). Kontroll (2) är en SLUTEN-VÄRLDS
// läkemedelskontroll: den fångar återinförande av motor-kända läkemedel utanför
// aktuella fynd; den fångar INTE påhittade läkemedel utanför motorns vokabulär
// (det mitigeras av kontroll 1 + den bundna prompten + det korta max_tokens).

import type { Finding } from "./rules/index.js";

export interface ValidationResult {
  ok: boolean;
  /** Människoläsbara överträdelser (för audit/flagga/test). Tom om ok. */
  violations: string[];
}

/** Normalisera till gemener + kollapsa whitespace för fras-/substräng-matchning. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ");
}

/** Bygg den källförankrade korpusen ur fynden: ALLT motor-genererat innehåll
 *  (rubrik, mekanism, konsekvens, klinisk not, källor, involverade koder). En
 *  fras som finns här är per definition källförankrad — LLM:en återger den. */
function findingsCorpus(findings: Finding[]): string {
  const parts: string[] = [];
  for (const f of findings) {
    parts.push(f.title, f.mechanism, f.consequence, f.clinicalNote);
    parts.push(...f.involved);
    for (const s of f.sources) parts.push(s.label, s.ref);
  }
  return norm(parts.join(" | "));
}

// --- Kontroll 1: beslutsspråk (imperativa/rekommenderande åtgärder) ---
// Detta är S1-essensen: LLM:en får ALDRIG rikta en åtgärd/rekommendation till
// klinikern. Fynden är deskriptiva (S1/S2), så dessa fraser kan bara dyka upp om
// LLM:en lade till dem. Korpus-subtraktionen nedan gör kontrollen robust: skulle
// en fras ordagrant finnas i ett fynd räknas den som källförankrad.
const DECISION_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\böverväg\w*\b/, label: 'rekommendation ("överväg…")' },
  { re: /\bsätt(?:s|a|er)? (?:ut|in)\b/, label: 'åtgärd ("sätt ut/in")' },
  { re: /\butsättning\b/, label: 'åtgärd ("utsättning")' },
  { re: /\b(?:sänk|höj|öka|minska|justera|dosjuster)\w* ?(?:\w+ )?dos\w*/, label: "dosändring" },
  { re: /\bjustera (?:dosen|behandling)/, label: "dosjustering" },
  { re: /\btrappa (?:ner|ut|upp)\b/, label: 'åtgärd ("trappa ner/ut")' },
  { re: /\b(?:byt ut|ersätt\w*)\b/, label: 'åtgärd ("byt ut/ersätt")' },
  { re: /\b(?:ordiner|förskriv|remitter)\w*\b/, label: "förskrivnings-/remiss-åtgärd" },
  { re: /\b(?:avsluta|avbryt|pausa) (?:behandling|läkemedl|medicin)/, label: "behandlingsstopp" },
  { re: /\bbör (?:du |man |patienten )?(?:sätta|ge|ges|öka|sänka|minska|byta|avsluta|trappa|förskriva)/, label: 'direktiv ("bör …")' },
  { re: /\bska (?:sättas|ges|ökas|sänkas|minskas|bytas|avslutas)\b/, label: 'direktiv ("ska …")' },
];

// --- Kontroll 2: motorns läkemedelsvokabulär (sluten värld) ---
// Substanser/klasser regelmotorn (interactions.ts + beers-stopp.ts) känner till
// och som demo-profilerna bär. Om narrativet nämner en av dessa men den INTE
// förekommer i de aktuella fyndens korpus → ogrundad introduktion.
const KNOWN_DRUGS: { re: RegExp; canon: string }[] = [
  { re: /\bwarfarin\b/, canon: "warfarin" },
  { re: /\bsertralin\b/, canon: "sertralin" },
  { re: /\bssri\b/, canon: "ssri" },
  { re: /\bamoxicillin\b/, canon: "amoxicillin" },
  { re: /\bpenicillin\w*\b/, canon: "penicillin" },
  { re: /\bomeprazol\b/, canon: "omeprazol" },
  { re: /\blansoprazol\b/, canon: "lansoprazol" },
  { re: /\b(?:ppi|protonpump\w*)\b/, canon: "ppi" },
  { re: /\bmetoprolol\b/, canon: "metoprolol" },
  { re: /\bmetformin\b/, canon: "metformin" },
  { re: /\bsimvastatin\b/, canon: "simvastatin" },
  { re: /\bamlodipin\b/, canon: "amlodipin" },
  { re: /\benalapril\b/, canon: "enalapril" },
  { re: /\bdigoxin\b/, canon: "digoxin" },
  { re: /\bfurosemid\b/, canon: "furosemid" },
];

/**
 * Validera ett syntetiserat narrativ mot de deterministiska fynden.
 * Ren funktion — ingen I/O. Returnerar { ok, violations }.
 *
 * @param text     LLM-narrativet som ska godkännas eller avvisas.
 * @param findings De deterministiska fynden narrativet MÅSTE hålla sig till.
 */
export function validateNarrative(text: string, findings: Finding[]): ValidationResult {
  const violations: string[] = [];
  const hay = norm(text);
  const corpus = findingsCorpus(findings);

  // Kontroll 1 — beslutsspråk (gated av korpus-subtraktion).
  for (const { re, label } of DECISION_PATTERNS) {
    const m = hay.match(re);
    if (m && !corpus.includes(m[0])) {
      violations.push(`Beslutsspråk i LLM:ens röst: "${m[0]}" (${label}) — saknar motsvarighet i fynden.`);
    }
  }

  // Kontroll 2 — ogrundad motor-känd läkemedelsreferens.
  for (const { re, canon } of KNOWN_DRUGS) {
    if (re.test(hay) && !corpus.includes(canon)) {
      violations.push(`Ogrundad läkemedelsreferens: "${canon}" nämns i narrativet men finns inte i något fynd.`);
    }
  }

  return { ok: violations.length === 0, violations };
}

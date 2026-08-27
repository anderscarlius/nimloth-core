// Förlustliggaren (Spec B4 §4, A4) — minimal (Grind 1 punkt c / S7: ingen
// verktygslåda). Källan till sanning är denna typade tabell, samlokaliserad
// med mappningskoden den beskriver — INTE ett handskrivet dokument.
// "Autogenererad" betyder här: dokumentet i nimloth-docs är en PRODUKT av
// scripts/generate-loss-ledger.ts, inte något som redigeras för hand. Lägg
// till ett fält i mappningen, kör om skriptet — ingen manuell synk.
//
// Utgångspunkt: Etapp 1:s facit-underlag (Spec B4 kapitel 11), nu med
// riktning eftersom S2 (B4 Etapp 2) skriver i båda riktningarna och vissa
// förluster bara gäller en av dem.

export type LossDirection = "legacy_to_nimloth" | "nimloth_to_legacy" | "both";

export interface LossLedgerEntry {
  field: string;
  direction: LossDirection;
  lost: string;
  reason: string;
}

export const LOSS_LEDGER_ENTRIES: LossLedgerEntry[] = [
  {
    field: "created_at / signed_at (tidszon)",
    direction: "legacy_to_nimloth",
    lost: "Tidszonen antas (Europe/Stockholm), hämtas inte ur källan.",
    reason:
      "legacy-sim lagrar lokal tid utan zon (D6, egen dialekt). Gatewayen antar +02:00 vid konvertering till ISO8601 för EHRbase. Ett antagande, inte ett faktum ur data — en riktig legacy-motpart kan ha en annan lokal konvention.",
  },
  {
    field: "created_at (tidszon)",
    direction: "nimloth_to_legacy",
    lost: "Tidszonen droppas helt — legacy:s schema har ingen kolumn för den.",
    reason:
      "Spegelbilden av ovan: EHRbase:s tidsstämpel har zon, legacy:s TIMESTAMP-kolumn (utan 'with time zone') kan inte bära den. Informationen finns inte förlorad i Nimloth (den finns kvar i EHRbase), bara i den skuggade legacy-kopian.",
  },
  {
    field: "author / composer (strukturerad identitet)",
    direction: "legacy_to_nimloth",
    lost: "author_sign (4 tecken) blir en fri textsträng i EHRbase:s composer.name, ingen refererad Practitioner.",
    reason:
      "legacy har ingen identitetsmodell utöver en opak fyrteckenskod. Ingen mappning mot en riktig praktikeridentitet görs eller kan göras utan ett HSA/SITHS-lager (Block 1, ej byggt).",
  },
  {
    field: "author / composer (strukturerad identitet)",
    direction: "nimloth_to_legacy",
    lost: "Författare EJ REKONSTRUERBAR. legacy:s author_sign-fält sätts till sentinelen \"----\", ALDRIG till Nimloth-komponentens verkliga namn.",
    reason:
      "Grind 1-amendemang (2026-08-27, punkt 1): ett fyrteckensfält i en journalhandling som betyder 'den här personen skrev det' får aldrig fyllas med en systemsignatur som kan förväxlas med riktiga initialer (jmf. seed-datats 'ANCA', 'BSVN') — det vore falsifierad attribution, inte en lossy konvertering. Utan ett riktigt HSA/SITHS-baserat identitetslager (Block 1) finns ingen tillförlitlig mappning att göra. Beslutet är därför explicit ingen mappning, inte en gissning.",
  },
  {
    field: "anteckningens innehåll (arketypgranularitet)",
    direction: "both",
    lost: "Legacy:s sökordsstruktur (Status:/Bedömning:/Åtgärd:) och en riktig arketyps separata structured element kollapsar till en enda fritextsträng (interims-OPT:ens enda DV_TEXT-element, D7).",
    reason:
      "Interims-OPT:en (progress_note.v1, D7 reviderad) har bara at0004 — hela anteckningen hamnar i en sträng oavsett riktning. En riktig progress-note-arketyp (designer-exporten som ska ersätta interimsfilen) skulle sannolikt ha separata fält. Symmetrisk förlust: ingen riktning kan idag återskapa en struktur som aldrig fanns maskinläsbar.",
  },
  {
    field: "kodade termer (terminologibundna fält)",
    direction: "both",
    lost: "Ingen förlust observerad ännu — anteckning-domänen har inga kodade fält att förlora.",
    reason:
      "Väntad relevans när B4:s mönster ärvs av läkemedel (ATC) eller lab (NPU), där kodade fält existerar på båda sidor (Spec B4 kapitel 8). Radad här som platshållare så listan inte ser mer komplett ut än den är.",
  },
];

export function renderLossLedgerMarkdown(generatedAtIso: string): string {
  const rows = LOSS_LEDGER_ENTRIES.map(
    (e) => `| ${e.field} | ${e.direction} | ${e.lost} | ${e.reason} |`,
  ).join("\n");
  return `# Förlustliggare — anteckning (B4 Etapp 2)

**Genererad:** ${generatedAtIso} av \`services/migration-gateway/src/scripts/generate-loss-ledger.ts\`, källa \`src/loss-ledger.ts\`.
**A4 (Spec B4 §6):** en rad per icke-mappat fält, inga manuella tillägg — se filens header-kommentar för vad "autogenererad" betyder i praktiken denna etapp.

| Fält | Riktning | Vad som går förlorat | Motivering |
|---|---|---|---|
${rows}
`;
}

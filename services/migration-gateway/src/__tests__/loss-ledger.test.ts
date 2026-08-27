import { describe, expect, it } from "vitest";
import { LOSS_LEDGER_ENTRIES, renderLossLedgerMarkdown } from "../loss-ledger.js";

describe("förlustliggaren", () => {
  it("varje post har alla obligatoriska fält ifyllda (kontraktet, inte bara typen)", () => {
    expect(LOSS_LEDGER_ENTRIES.length).toBeGreaterThan(0);
    for (const entry of LOSS_LEDGER_ENTRIES) {
      expect(entry.field.length).toBeGreaterThan(0);
      expect(["legacy_to_nimloth", "nimloth_to_legacy", "both"]).toContain(entry.direction);
      expect(entry.lost.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it("registrerar Grind 1-amendemang punkt 1 (författare ej rekonstruerbar, ingen sentinel-gissning)", () => {
    const authorEntry = LOSS_LEDGER_ENTRIES.find(
      (e) => e.direction === "nimloth_to_legacy" && e.field.toLowerCase().includes("author"),
    );
    expect(authorEntry).toBeDefined();
    expect(authorEntry?.lost).toMatch(/EJ REKONSTRUERBAR/);
  });

  it("renderLossLedgerMarkdown producerar en rad per post plus tabellhuvud och avgränsare", () => {
    const md = renderLossLedgerMarkdown("2026-08-27T00:00:00.000Z");
    // Avgränsarraden består ENDAST av "|", "-" och whitespace — till
    // skillnad från t.ex. author-postens "----"-sentinel, som annars
    // felaktigt skulle matcha en lös "innehåller ---"-kontroll.
    const isSeparatorRow = (line: string) => /^\|[\s|-]+\|$/.test(line);
    const tableLines = md.split("\n").filter((line) => line.startsWith("| ") || isSeparatorRow(line));
    const separatorCount = tableLines.filter(isSeparatorRow).length;
    expect(separatorCount).toBe(1);
    expect(tableLines.length - 1 - separatorCount).toBe(LOSS_LEDGER_ENTRIES.length);
  });
});

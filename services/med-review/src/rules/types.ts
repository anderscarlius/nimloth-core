// Deterministiska regelmotorers gemensamma typer (Fas 3 AC4).
//
// S1 (regulatorisk ryggrad): ALLA kliniska bedömningar härrör från dessa
// regelmotorer mot publicerade kriterier, med källhänvisning — ALDRIG från
// LLM-omdöme. Finding-objekten är DESKRIPTIVA (mekanism, konsekvens, klinisk
// kontext), aldrig imperativa order — det håller demon utanför MDR Rule 11.

export type Severity = "low" | "moderate" | "high";
export type FindingKind = "interaction" | "contraindication" | "beers_stopp";

export interface Source {
  /** Kort etikett, t.ex. "Janusmed" / "Beers 2023" / "StatPearls NBK482250". */
  label: string;
  /** Referens-ID/URL/citat. */
  ref: string;
}

export interface Finding {
  /** Stabil regel-id (deterministiskt, för audit/test). */
  id: string;
  kind: FindingKind;
  severity: Severity;
  /** Kort svensk rubrik. */
  title: string;
  /** ATC-koder / substanskoder som triggade fyndet. */
  involved: string[];
  /** Farmakologisk/klinisk mekanism (deskriptiv). */
  mechanism: string;
  /** Klinisk konsekvens (deskriptiv). */
  consequence: string;
  /** Klinisk kontext/övervakningsnot — INFORMATION, ej imperativ order. */
  clinicalNote: string;
  /** Källhänvisning(ar) — varje fynd MÅSTE ha minst en. */
  sources: Source[];
}

/** Patientögonblicksbild som regelmotorerna konsumerar. Hämtas av
 *  orkestratorn (AC5) via AQL-mall-tjänsten — regelmotorerna är rena
 *  funktioner utan I/O. */
export interface MedicationItem {
  atc: string;
  name: string;
}
export interface AllergyItem {
  substanceCode: string;
  substanceName: string;
  reactionType: string;
  criticality: string;
}
export interface PatientSnapshot {
  patientId: string;
  age?: number;
  activeMedications: MedicationItem[];
  allergies: AllergyItem[];
}

// 15 AQL demo queries — SDG-10 äkta-paths edition.
//
// SDG-10 invariants in play:
//   - INVARIANT 2 (consumer): lab queries filter on OBSERVATION archetype
//     `openEHR-EHR-OBSERVATION.laboratory_test_result.v1`, NOT on FLAT-prefix
//     `event_series` (shared with time_series.en.v1).
//   - Medication/diagnosis queries filter via EVALUATION archetype or
//     `c/archetype_details/template_id/value`.
//   - Fixture-shape types (vital_signs, primary_care_encounter, lab_order,
//     referral, specialist_consultation, care_plan, discharge_summary) are
//     NOT migrated in SDG-10 — those queries still rely on composer.name LIKE.
//
// Other constraints:
//   - EHRbase AQL uses '*' wildcard for LIKE
//   - No GROUP BY — aggregation done client-side
//   - ORDER BY/WHERE must use full paths, not column aliases
//   - DV_QUANTITY magnitude is queryable server-side (numeric comparisons OK)

export type AqlCategory = "A" | "B" | "C";

/**
 * Promotion tier — decides whether the query is honest enough to register as
 * a Fas 2 Compose-mall.
 *   "honest" — all clinical filters use äkta archetype paths; no composer.name
 *              LIKE, no fixture-shape proxies.
 *   "proxy"  — still depends on fixture-shape composer.name LIKE or on a
 *              proxy-encoding (e.g. AQL-11 misuses diagnosis_code for a
 *              profile tag). SDG-internal only; do NOT promote to Fas 2.
 */
export type AqlTier = "honest" | "proxy";

export interface AqlSpec {
  id: string;
  category: AqlCategory;
  /** Promotion tier — gates Fas 2 AQL-mall-tjänst registration. */
  tier: AqlTier;
  title: string;
  description: string;
  aql: string;
  /** Optional client-side post-processor for aggregations EHRbase can't do. */
  postProcess?: (rows: unknown[][]) => unknown[];
  /** Minimum expected non-zero result rows (for AC verification). */
  expectedMinResults?: number;
  /**
   * Optional parameters for Fas 2-lifting. The AQL string contains placeholders
   * (e.g. `:hba1c_threshold`) that the query runner substitutes from this map.
   * Defaults shipped here are SDG-10 baselines; Fas 2 overrides per-call.
   */
  params?: Record<string, number | string>;
}

/** Substitute :param placeholders in an AQL string with values from a map.
 *  Numbers inlined; strings quoted. SDG-10 shipped with one parameter:
 *  AQL-02:hba1c_threshold. Extend cautiously — params are inline-substituted,
 *  not bound, so they MUST be from a trusted source. */
export function bindAqlParams(
  aql: string,
  params: Record<string, number | string> = {},
): string {
  return aql.replace(/:([a-z_][a-z_0-9]*)/g, (m, name) => {
    if (!(name in params)) return m;
    const v = params[name];
    return typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
  });
}

const MARIANNE_ID = "marianne-lindqvist-syn-001";

// Path constants — keep one source of truth for äkta-paths so a future
// archetype change touches only this block.
const PD_DIAG_NAME = "v/data[at0001]/items[at0002]/value/value";
const PD_DIAG_CODE = "v/data[at0001]/items[at0003]/value/defining_code/code_string";
const MED_NAME = "m/data[at0001]/items[at0002]/value/value";
const MED_ATC = "m/data[at0001]/items[at0003]/value/defining_code/code_string";
const LAB_ANALYTE = "o/data[at0001]/events[at0002]/data[at0003]/items[at0004]/value/value";
const LAB_MAGNITUDE = "o/data[at0001]/events[at0002]/data[at0003]/items[at0006]/value/magnitude";
const LAB_UNITS = "o/data[at0001]/events[at0002]/data[at0003]/items[at0006]/value/units";

const PD_ARCHETYPE = "openEHR-EHR-EVALUATION.problem_diagnosis.v1";
const MED_ARCHETYPE = "openEHR-EHR-EVALUATION.medication_summary.v1";
const LAB_ARCHETYPE = "openEHR-EHR-OBSERVATION.laboratory_test_result.v1";

export const QUERIES: AqlSpec[] = [
  // === Kategori A — Grundläggande populationssökning ===
  {
    id: "AQL-01",
    category: "A",
    tier: "honest",
    title: "Patienter med diagnos diabetes mellitus typ 2 (E11)",
    description:
      "Patienter med problem_diagnosis-composition vars diagnos_code = E11 (äkta ICD-10, normaliserad i Fas 3 — ingen profil-tagg). Fångar både diabetes_typ2-profilen och aldre_multisjuk-metformin-bärare.",
    aql: `SELECT DISTINCT e/ehr_id/value
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS EVALUATION v[${PD_ARCHETYPE}]
WHERE ${PD_DIAG_CODE} = 'E11'`,
    expectedMinResults: 50,
  },
  {
    id: "AQL-02",
    category: "A",
    tier: "honest",
    title: "Patienter med HbA1c > :hba1c_threshold (senaste värdet)",
    description:
      "lab_result-compositions med analyte_name='HBA1C' och magnitude över parametriserad tröskel (server-side filter, Fas 2-liftbar). Senaste värde per patient client-side.",
    aql: `SELECT e/ehr_id/value, ${LAB_MAGNITUDE}, ${LAB_UNITS}, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS OBSERVATION o[${LAB_ARCHETYPE}]
WHERE ${LAB_ANALYTE} = 'HBA1C'
AND ${LAB_MAGNITUDE} > :hba1c_threshold
ORDER BY c/context/start_time/value DESC`,
    params: { hba1c_threshold: 70 },
    postProcess: (rows) => {
      const seen = new Set<string>();
      const latest: unknown[] = [];
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        if (seen.has(ehr)) continue;
        seen.add(ehr);
        latest.push({
          ehr,
          hba1c: Number((r as unknown[])[1]),
          unit: String((r as unknown[])[2]),
        });
      }
      return latest;
    },
    expectedMinResults: 10,
  },
  {
    id: "AQL-03",
    category: "A",
    tier: "proxy",
    title: "Patienter med systoliskt BT > 160 (senaste mätning)",
    description:
      "vital_signs-events i time_series — fixture-shape, ej migrerad i SDG-10. composer.name LIKE kvar.",
    aql: `SELECT e/ehr_id/value, c/composer/name, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*vital_signs*BP*'
ORDER BY c/context/start_time/value DESC`,
    postProcess: (rows) => {
      const seen = new Set<string>();
      const out: unknown[] = [];
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        if (seen.has(ehr)) continue;
        seen.add(ehr);
        const name = String((r as unknown[])[1]);
        const m = name.match(/systolic\s+(\d+)/);
        const val = m ? Number(m[1]) : NaN;
        if (val > 160) out.push({ ehr, systolic: val });
      }
      return out;
    },
    expectedMinResults: 5,
  },
  {
    id: "AQL-04",
    category: "A",
    tier: "honest",
    title: "Patienter med ≥ 5 medication_statement-events (polyfarmaci)",
    description:
      "Räkna medication_summary-compositions per patient (äkta template-filter).",
    aql: `SELECT e/ehr_id/value
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS EVALUATION m[${MED_ARCHETYPE}]`,
    postProcess: (rows) => {
      const counts = new Map<string, number>();
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        counts.set(ehr, (counts.get(ehr) ?? 0) + 1);
      }
      return [...counts.entries()]
        .filter(([, n]) => n >= 5)
        .map(([ehr, n]) => ({ ehr, medications: n }));
    },
    expectedMinResults: 5,
  },
  {
    id: "AQL-05",
    category: "A",
    tier: "proxy",
    title: "Patienter med remiss (referral-event)",
    description:
      "referral är fixture-shape (minimal_action.en.v1) — ej migrerad i SDG-10. composer.name LIKE kvar.",
    aql: `SELECT DISTINCT e/ehr_id/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*referral*'`,
    expectedMinResults: 30,
  },

  // === Kategori B — Temporal analys och vårdkvalitet ===
  {
    id: "AQL-06",
    category: "B",
    tier: "honest",
    title: "Diabetespatienter (E11) utan uppföljande HbA1c",
    description:
      "OR-in-CONTAINS: pd E11 + lab HBA1C i samma resultset. Dropout = E11-diagnos finns men INGEN HbA1c alls efter diagnos. Inget tidsfönster (de-konflaterad). Diabetes nyckas på äkta E11 (Fas 3-normalisering), ej profil-tagg.",
    aql: `SELECT e/ehr_id/value,
       c/archetype_details/template_id/value,
       c/context/start_time/value,
       ${PD_DIAG_CODE},
       ${LAB_ANALYTE}
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS (EVALUATION v[${PD_ARCHETYPE}] OR OBSERVATION o[${LAB_ARCHETYPE}])
ORDER BY e/ehr_id/value, c/context/start_time/value`,
    postProcess: (rows) => {
      const byPatient = new Map<string, { diagDate?: string; followUp?: string }>();
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        const tpl = String((r as unknown[])[1]);
        const t = String((r as unknown[])[2]);
        const diagCode = (r as unknown[])[3];
        const analyte = (r as unknown[])[4];
        const entry = byPatient.get(ehr) ?? {};
        if (tpl === "problem_diagnosis.v1" && String(diagCode) === "E11" && !entry.diagDate) {
          entry.diagDate = t;
        }
        if (tpl === "laboratory_test_result.v1" && analyte === "HBA1C" && entry.diagDate && t > entry.diagDate) {
          entry.followUp = t;
        }
        byPatient.set(ehr, entry);
      }
      const out: unknown[] = [];
      for (const [ehr, e] of byPatient.entries()) {
        if (!e.diagDate) continue;
        // dropout ⟺ diabetes-diagnos OCH noll HbA1c efter diagnos. Inget fönster:
        // vilken uppföljnings-HbA1c som helst (oavsett tidpunkt) → INTE dropout.
        if (!e.followUp) {
          out.push({ ehr, diagnosed: e.diagDate, followup_missing: true });
        }
      }
      return out;
    },
  },
  {
    id: "AQL-07",
    category: "B",
    tier: "honest",
    title: "HbA1c-trend per patient (första vs senaste värde)",
    description:
      "Per patient: första och senaste HbA1c via DV_QUANTITY-magnitude (ej regex på annotation).",
    aql: `SELECT e/ehr_id/value, ${LAB_MAGNITUDE}, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS OBSERVATION o[${LAB_ARCHETYPE}]
WHERE ${LAB_ANALYTE} = 'HBA1C'
ORDER BY e/ehr_id/value, c/context/start_time/value`,
    postProcess: (rows) => {
      const byPatient = new Map<string, { first?: { date: string; val: number }; last?: { date: string; val: number } }>();
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        const val = Number((r as unknown[])[1]);
        if (!Number.isFinite(val)) continue;
        const date = String((r as unknown[])[2]);
        const entry = byPatient.get(ehr) ?? {};
        if (!entry.first) entry.first = { date, val };
        entry.last = { date, val };
        byPatient.set(ehr, entry);
      }
      return [...byPatient.entries()]
        .filter(([, e]) => e.first && e.last && e.first.date !== e.last.date)
        .map(([ehr, e]) => ({
          ehr,
          first: e.first,
          last: e.last,
          delta: Math.round((e.last!.val - e.first!.val) * 10) / 10,
        }));
    },
  },
  {
    id: "AQL-08",
    category: "B",
    tier: "proxy",
    title: "Median dagar från första kontakt till remiss (per profil)",
    description:
      "encounter+referral är fixture — kvar på composer.name LIKE.",
    aql: `SELECT e/ehr_id/value, c/composer/name, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*primary_care_encounter*' OR c/composer/name LIKE '*referral*'
ORDER BY e/ehr_id/value, c/context/start_time/value`,
    postProcess: (rows) => {
      const byPatient = new Map<string, { profile?: string; firstContact?: string; referral?: string }>();
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        const name = String((r as unknown[])[1]);
        const t = String((r as unknown[])[2]);
        const entry = byPatient.get(ehr) ?? {};
        if (name.includes("primary_care_encounter") && !entry.firstContact) {
          entry.firstContact = t;
        }
        if (name.includes("referral") && !entry.referral) {
          entry.referral = t;
          const m = name.match(/referral \| ([a-z_]+)/);
          if (m) entry.profile = m[1];
        }
        byPatient.set(ehr, entry);
      }
      const perProfile = new Map<string, number[]>();
      for (const [, e] of byPatient.entries()) {
        if (!e.firstContact || !e.referral) continue;
        const days = (new Date(e.referral).getTime() - new Date(e.firstContact).getTime()) / 86400000;
        if (!Number.isFinite(days)) continue;
        const arr = perProfile.get(e.profile ?? "unknown") ?? [];
        arr.push(Math.round(days));
        perProfile.set(e.profile ?? "unknown", arr);
      }
      const out: unknown[] = [];
      for (const [profile, arr] of perProfile.entries()) {
        arr.sort((a, b) => a - b);
        const median = arr[Math.floor(arr.length / 2)];
        out.push({ profile, n: arr.length, median_days: median });
      }
      return out;
    },
  },
  {
    id: "AQL-09",
    category: "B",
    tier: "proxy",
    title: "Patienter med > 3 primary_care_encounter under 90 dagar",
    description:
      "primary_care_encounter är fixture — composer.name LIKE kvar.",
    aql: `SELECT e/ehr_id/value, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*primary_care_encounter*'
ORDER BY e/ehr_id/value, c/context/start_time/value`,
    postProcess: (rows) => {
      const byPatient = new Map<string, string[]>();
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        const t = String((r as unknown[])[1]);
        const arr = byPatient.get(ehr) ?? [];
        arr.push(t);
        byPatient.set(ehr, arr);
      }
      const out: unknown[] = [];
      for (const [ehr, dates] of byPatient.entries()) {
        if (dates.length < 4) continue;
        for (let i = 0; i <= dates.length - 4; i++) {
          const span = new Date(dates[i + 3]).getTime() - new Date(dates[i]).getTime();
          if (span / 86400000 <= 90) {
            out.push({ ehr, encounters: dates.length });
            break;
          }
        }
      }
      return out;
    },
  },
  {
    id: "AQL-10",
    category: "B",
    tier: "honest",
    title: "Patienter med förbättrade labbvärden efter läkemedelsinsättning",
    description:
      "OR-in-CONTAINS lab+med. Patient där HbA1c sista < första OCH medication_summary mellan dessa.",
    aql: `SELECT e/ehr_id/value,
       c/archetype_details/template_id/value,
       c/context/start_time/value,
       ${LAB_ANALYTE},
       ${LAB_MAGNITUDE}
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS (OBSERVATION o[${LAB_ARCHETYPE}] OR EVALUATION m[${MED_ARCHETYPE}])
ORDER BY e/ehr_id/value, c/context/start_time/value`,
    postProcess: (rows) => {
      const byPatient = new Map<string, { firstLab?: { date: string; val: number }; rxAfter?: string; lastLab?: { date: string; val: number } }>();
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        const tpl = String((r as unknown[])[1]);
        const date = String((r as unknown[])[2]);
        const analyte = (r as unknown[])[3];
        const magnitude = (r as unknown[])[4];
        const entry = byPatient.get(ehr) ?? {};
        if (tpl === "laboratory_test_result.v1" && analyte === "HBA1C") {
          const val = Number(magnitude);
          if (Number.isFinite(val)) {
            if (!entry.firstLab) entry.firstLab = { date, val };
            entry.lastLab = { date, val };
          }
        } else if (tpl === "medication_summary.v1" && entry.firstLab && !entry.rxAfter) {
          if (date >= entry.firstLab.date) entry.rxAfter = date;
        }
        byPatient.set(ehr, entry);
      }
      const out: unknown[] = [];
      for (const [ehr, e] of byPatient.entries()) {
        if (e.firstLab && e.lastLab && e.rxAfter && e.lastLab.val < e.firstLab.val) {
          out.push({
            ehr,
            first: e.firstLab,
            last: e.lastLab,
            rx_at: e.rxAfter,
            delta: Math.round((e.lastLab.val - e.firstLab.val) * 10) / 10,
          });
        }
      }
      return out;
    },
  },

  // === Kategori C — Komplexa kliniska samband ===
  {
    id: "AQL-11",
    category: "C",
    tier: "honest",
    title: "Äldre multisjuka patienter (≥3 ICD-diagnoser + polyfarmaci)",
    description:
      "OR-in-CONTAINS pd+med. Fas 3 (Fork-4): ÄRLIG — räknar patienter med ≥3 DISTINKTA äkta ICD-diagnoser (mönster bokstav+siffra) OCH ≥5 medication_summary. Ej längre beroende av profil-taggen 'aldre_multisjuk' — komorbiditeterna härleds nu strukturellt ur medicinerna.",
    aql: `SELECT e/ehr_id/value,
       c/archetype_details/template_id/value,
       ${PD_DIAG_CODE}
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS (EVALUATION v[${PD_ARCHETYPE}] OR EVALUATION m[${MED_ARCHETYPE}])`,
    postProcess: (rows) => {
      const icdSets = new Map<string, Set<string>>();
      const meds = new Map<string, number>();
      const ICD10 = /^[A-Z]\d/; // äkta ICD-10: bokstav + siffra (E11, I48, M10…)
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        const tpl = String((r as unknown[])[1]);
        const diagCode = (r as unknown[])[2];
        if (tpl === "problem_diagnosis.v1" && diagCode && ICD10.test(String(diagCode))) {
          const set = icdSets.get(ehr) ?? new Set<string>();
          set.add(String(diagCode));
          icdSets.set(ehr, set);
        }
        if (tpl === "medication_summary.v1") {
          meds.set(ehr, (meds.get(ehr) ?? 0) + 1);
        }
      }
      const out: unknown[] = [];
      for (const [ehr, icds] of icdSets.entries()) {
        if (icds.size >= 3 && (meds.get(ehr) ?? 0) >= 5) {
          out.push({ ehr, distinct_icd: icds.size, medications: meds.get(ehr) });
        }
      }
      return out;
    },
  },
  {
    id: "AQL-12",
    category: "C",
    tier: "proxy",
    title: "Marianne Lindqvists fullständiga journal kronologiskt",
    description:
      "Alla compositions för Marianne, sorterat efter datum. Subject-id-filter — ingen LIKE.",
    aql: `SELECT c/composer/name, c/context/start_time/value, c/uid/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE e/ehr_status/subject/external_ref/id/value = '${MARIANNE_ID}'
ORDER BY c/context/start_time/value`,
  },
  {
    id: "AQL-13",
    category: "C",
    tier: "honest",
    title: "Patienter med >= 7 medication_statement (proxy för läkemedelsinteraktionsrisk)",
    description:
      "Räkna medication_summary-compositions per patient (äkta template-filter).",
    aql: `SELECT e/ehr_id/value
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS EVALUATION m[${MED_ARCHETYPE}]`,
    postProcess: (rows) => {
      const counts = new Map<string, number>();
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        counts.set(ehr, (counts.get(ehr) ?? 0) + 1);
      }
      return [...counts.entries()]
        .filter(([, n]) => n >= 7)
        .map(([ehr, n]) => ({ ehr, medications: n }));
    },
  },
  {
    id: "AQL-14",
    category: "C",
    tier: "honest",
    title: "Patienter vars labbvärden FÖRSÄMRATS trots läkemedelsinsättning",
    description:
      "Spegelbild av AQL-10: HbA1c sista > första, med medication_summary mellan.",
    aql: `SELECT e/ehr_id/value,
       c/archetype_details/template_id/value,
       c/context/start_time/value,
       ${LAB_ANALYTE},
       ${LAB_MAGNITUDE}
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS (OBSERVATION o[${LAB_ARCHETYPE}] OR EVALUATION m[${MED_ARCHETYPE}])
ORDER BY e/ehr_id/value, c/context/start_time/value`,
    postProcess: (rows) => {
      const byPatient = new Map<string, { firstLab?: { date: string; val: number }; rxAfter?: string; lastLab?: { date: string; val: number } }>();
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        const tpl = String((r as unknown[])[1]);
        const date = String((r as unknown[])[2]);
        const analyte = (r as unknown[])[3];
        const magnitude = (r as unknown[])[4];
        const entry = byPatient.get(ehr) ?? {};
        if (tpl === "laboratory_test_result.v1" && analyte === "HBA1C") {
          const val = Number(magnitude);
          if (Number.isFinite(val)) {
            if (!entry.firstLab) entry.firstLab = { date, val };
            entry.lastLab = { date, val };
          }
        } else if (tpl === "medication_summary.v1" && entry.firstLab && !entry.rxAfter) {
          if (date >= entry.firstLab.date) entry.rxAfter = date;
        }
        byPatient.set(ehr, entry);
      }
      const out: unknown[] = [];
      for (const [ehr, e] of byPatient.entries()) {
        if (e.firstLab && e.lastLab && e.rxAfter && e.lastLab.val > e.firstLab.val) {
          out.push({
            ehr,
            first: e.firstLab,
            last: e.lastLab,
            delta: Math.round((e.lastLab.val - e.firstLab.val) * 10) / 10,
          });
        }
      }
      return out;
    },
  },
  {
    id: "AQL-15",
    category: "C",
    tier: "honest",
    title: "Median-magnitude per labbtyp (proxy för populationsstatistik)",
    description:
      "Per analyt: median+min+max via DV_QUANTITY direkt. Client-side aggregering (AQL saknar GROUP BY).",
    aql: `SELECT ${LAB_ANALYTE}, ${LAB_MAGNITUDE}, ${LAB_UNITS}
FROM EHR e
CONTAINS COMPOSITION c
CONTAINS OBSERVATION o[${LAB_ARCHETYPE}]`,
    postProcess: (rows) => {
      const byAnalyte = new Map<string, { units: string; values: number[] }>();
      for (const r of rows) {
        const analyte = String((r as unknown[])[0] ?? "other");
        const val = Number((r as unknown[])[1]);
        const unit = String((r as unknown[])[2] ?? "");
        if (!Number.isFinite(val)) continue;
        const bucket = byAnalyte.get(analyte) ?? { units: unit, values: [] };
        bucket.values.push(val);
        byAnalyte.set(analyte, bucket);
      }
      const out: unknown[] = [];
      for (const [analyte, b] of byAnalyte.entries()) {
        b.values.sort((a, b) => a - b);
        out.push({
          analyte,
          unit: b.units,
          n: b.values.length,
          median: b.values[Math.floor(b.values.length / 2)],
          min: b.values[0],
          max: b.values[b.values.length - 1],
        });
      }
      return out;
    },
  },
];

export function getQuery(id: string): AqlSpec | undefined {
  return QUERIES.find((q) => q.id === id);
}

export function getByCategory(c: AqlCategory): AqlSpec[] {
  return QUERIES.filter((q) => q.category === c);
}

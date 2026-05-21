// 15 AQL demo queries adapted to the fixture-shape population.
//
// Constraints:
//   - EHRbase AQL uses '*' wildcard for LIKE (not '%')
//   - No GROUP BY support — aggregation done client-side in AqlRunner
//   - Clinical semantics (diagnosis, drug name) live in composer.name; we filter
//     via LIKE on those annotations.

export type AqlCategory = "A" | "B" | "C";

export interface AqlSpec {
  id: string;
  category: AqlCategory;
  title: string;
  description: string;
  aql: string;
  /** Optional client-side post-processor for aggregations EHRbase can't do. */
  postProcess?: (rows: unknown[][]) => unknown[];
  /** Minimum expected non-zero result rows (for AC verification). */
  expectedMinResults?: number;
}

const MARIANNE_ID = "marianne-lindqvist-syn-001";

export const QUERIES: AqlSpec[] = [
  // === Kategori A — Grundläggande populationssökning ===
  {
    id: "AQL-01",
    category: "A",
    title: "Patienter med diagnos diabetes typ 2",
    description: "Alla patienter med problem_diagnosis-event för diabetes_typ2 (ICD E11).",
    aql: `SELECT DISTINCT e/ehr_id/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*problem_diagnosis*diabetes_typ2*'`,
    expectedMinResults: 50,
  },
  {
    id: "AQL-02",
    category: "A",
    title: "Patienter med HbA1c > 70 (senaste värdet)",
    description:
      "lab_result-compositions med composer.name innehållande HBA1C och magnitude > 70. Senaste värde per patient bestäms client-side.",
    aql: `SELECT e/ehr_id/value, c/composer/name, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c CONTAINS OBSERVATION o
WHERE c/composer/name LIKE '*HBA1C*'
ORDER BY c/context/start_time/value DESC`,
    postProcess: (rows) => {
      // Keep latest per ehr_id; filter magnitude > 70 (parsed from annotation).
      const seen = new Set<string>();
      const latest: unknown[] = [];
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        if (seen.has(ehr)) continue;
        seen.add(ehr);
        const name = String((r as unknown[])[1]);
        const m = name.match(/(\d+(?:\.\d+)?)\s*mmol\/mol/);
        const val = m ? Number(m[1]) : NaN;
        if (val > 70) latest.push({ ehr, hba1c: val });
      }
      return latest;
    },
    expectedMinResults: 10,
  },
  {
    id: "AQL-03",
    category: "A",
    title: "Patienter med systoliskt BT > 160 (senaste mätning)",
    description: "vital_signs-events med magnitude > 160 i time_series (representerar systoliskt BT).",
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
    title: "Patienter med ≥ 5 medication_statement-events (polyfarmaci)",
    description:
      "Räkna medication_statement per patient. Eftersom AQL saknar GROUP BY görs aggregeringen client-side.",
    aql: `SELECT e/ehr_id/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*medication_statement*'`,
    postProcess: (rows) => {
      const counts = new Map<string, number>();
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        counts.set(ehr, (counts.get(ehr) ?? 0) + 1);
      }
      return [...counts.entries()].filter(([, n]) => n >= 5).map(([ehr, n]) => ({ ehr, medications: n }));
    },
    expectedMinResults: 5,
  },
  {
    id: "AQL-05",
    category: "A",
    title: "Patienter med remiss (referral-event)",
    description: "DISTINCT EHR med minst en referral-composition.",
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
    title: "Diabetespatienter utan uppföljande HbA1c inom 90 dagar",
    description:
      "Diabetes-patienter (problem_diagnosis*diabetes_typ2) som saknar lab_result*HBA1C minst 90 dagar efter diagnostidpunkt. Aggregeras client-side.",
    aql: `SELECT e/ehr_id/value, c/composer/name, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*diabetes_typ2*' OR c/composer/name LIKE '*HBA1C*'
ORDER BY e/ehr_id/value, c/context/start_time/value`,
    postProcess: (rows) => {
      const byPatient = new Map<string, { diagDate?: string; followUp?: string }>();
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        const name = String((r as unknown[])[1]);
        const t = String((r as unknown[])[2]);
        const entry = byPatient.get(ehr) ?? {};
        if (name.includes("problem_diagnosis") && name.includes("diabetes_typ2") && !entry.diagDate) {
          entry.diagDate = t;
        }
        if (name.includes("HBA1C") && entry.diagDate && t > entry.diagDate) {
          entry.followUp = t;
        }
        byPatient.set(ehr, entry);
      }
      const out: unknown[] = [];
      for (const [ehr, e] of byPatient.entries()) {
        if (!e.diagDate) continue;
        if (!e.followUp) {
          out.push({ ehr, diagnosed: e.diagDate, followup_missing: true });
          continue;
        }
        const days = (new Date(e.followUp).getTime() - new Date(e.diagDate).getTime()) / 86400000;
        if (days > 90) out.push({ ehr, diagnosed: e.diagDate, followup_days: Math.round(days) });
      }
      return out;
    },
  },
  {
    id: "AQL-07",
    category: "B",
    title: "HbA1c-trend per patient (första vs senaste värde)",
    description:
      "Per diabetes-patient: hitta första och senaste HbA1c, beräkna förändring. Aggregering client-side.",
    aql: `SELECT e/ehr_id/value, c/composer/name, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*HBA1C*'
ORDER BY e/ehr_id/value, c/context/start_time/value`,
    postProcess: (rows) => {
      const byPatient = new Map<string, { first?: { date: string; val: number }; last?: { date: string; val: number } }>();
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        const m = String((r as unknown[])[1]).match(/(\d+(?:\.\d+)?)\s*mmol\/mol/);
        if (!m) continue;
        const val = Number(m[1]);
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
    title: "Median dagar från första kontakt till remiss (per profil)",
    description:
      "Per profil: median(dagar mellan primary_care_encounter och referral) — aggregering client-side.",
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
    title: "Patienter med > 3 primary_care_encounter under 90 dagar",
    description: "Per patient: räkna primary_care_encounter; flagga om > 3 inom 90 dagar.",
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
    title: "Patienter med förbättrade labbvärden efter läkemedelsinsättning",
    description:
      "Patienter där HbA1c sista mätningen är lägre än första, och en medication_statement existerar mellan dessa.",
    aql: `SELECT e/ehr_id/value, c/composer/name, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*HBA1C*' OR c/composer/name LIKE '*medication_statement*'
ORDER BY e/ehr_id/value, c/context/start_time/value`,
    postProcess: (rows) => {
      const byPatient = new Map<string, { firstLab?: { date: string; val: number }; rxAfter?: string; lastLab?: { date: string; val: number } }>();
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        const name = String((r as unknown[])[1]);
        const date = String((r as unknown[])[2]);
        const entry = byPatient.get(ehr) ?? {};
        if (name.includes("HBA1C")) {
          const m = name.match(/(\d+(?:\.\d+)?)\s*mmol\/mol/);
          if (m) {
            const val = Number(m[1]);
            if (!entry.firstLab) entry.firstLab = { date, val };
            entry.lastLab = { date, val };
          }
        } else if (name.includes("medication_statement") && entry.firstLab && !entry.rxAfter) {
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
    title: "Äldre multisjuka patienter (proxy: aldre_multisjuk-profil)",
    description:
      "Patienter med problem_diagnosis*aldre_multisjuk OCH minst 5 medication_statement (polyfarmaci). Marianne ska träffas.",
    aql: `SELECT e/ehr_id/value, c/composer/name
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*aldre_multisjuk*' OR c/composer/name LIKE '*medication_statement*'`,
    postProcess: (rows) => {
      const isMulti = new Set<string>();
      const meds = new Map<string, number>();
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        const name = String((r as unknown[])[1]);
        if (name.includes("problem_diagnosis") && name.includes("aldre_multisjuk")) {
          isMulti.add(ehr);
        }
        if (name.includes("medication_statement")) {
          meds.set(ehr, (meds.get(ehr) ?? 0) + 1);
        }
      }
      return [...isMulti].filter((ehr) => (meds.get(ehr) ?? 0) >= 5).map((ehr) => ({ ehr, medications: meds.get(ehr) }));
    },
  },
  {
    id: "AQL-12",
    category: "C",
    title: "Marianne Lindqvists fullständiga journal kronologiskt",
    description: "Alla compositions för Marianne, sorterat efter datum.",
    aql: `SELECT c/composer/name, c/context/start_time/value, c/uid/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE e/ehr_status/subject/external_ref/id/value = '${MARIANNE_ID}'
ORDER BY c/context/start_time/value`,
  },
  {
    id: "AQL-13",
    category: "C",
    title: "Patienter med >= 7 medication_statement (proxy för läkemedelsinteraktionsrisk)",
    description:
      "Specens warfarin+NSAID-fråga kan inte uppfyllas semantiskt i fixture-shapes. Använder polyfarmaci-proxy istället.",
    aql: `SELECT e/ehr_id/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*medication_statement*'`,
    postProcess: (rows) => {
      const counts = new Map<string, number>();
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        counts.set(ehr, (counts.get(ehr) ?? 0) + 1);
      }
      return [...counts.entries()].filter(([, n]) => n >= 7).map(([ehr, n]) => ({ ehr, medications: n }));
    },
  },
  {
    id: "AQL-14",
    category: "C",
    title: "Patienter vars labbvärden FÖRSÄMRATS trots läkemedelsinsättning",
    description: "Spegelbild av AQL-10: HbA1c sista > första, med medication_statement mellan.",
    aql: `SELECT e/ehr_id/value, c/composer/name, c/context/start_time/value
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*HBA1C*' OR c/composer/name LIKE '*medication_statement*'
ORDER BY e/ehr_id/value, c/context/start_time/value`,
    postProcess: (rows) => {
      const byPatient = new Map<string, { firstLab?: { date: string; val: number }; rxAfter?: string; lastLab?: { date: string; val: number } }>();
      for (const r of rows) {
        const ehr = String((r as unknown[])[0]);
        const name = String((r as unknown[])[1]);
        const date = String((r as unknown[])[2]);
        const entry = byPatient.get(ehr) ?? {};
        if (name.includes("HBA1C")) {
          const m = name.match(/(\d+(?:\.\d+)?)\s*mmol\/mol/);
          if (m) {
            const val = Number(m[1]);
            if (!entry.firstLab) entry.firstLab = { date, val };
            entry.lastLab = { date, val };
          }
        } else if (name.includes("medication_statement") && entry.firstLab && !entry.rxAfter) {
          if (date >= entry.firstLab.date) entry.rxAfter = date;
        }
        byPatient.set(ehr, entry);
      }
      const out: unknown[] = [];
      for (const [ehr, e] of byPatient.entries()) {
        if (e.firstLab && e.lastLab && e.rxAfter && e.lastLab.val > e.firstLab.val) {
          out.push({ ehr, first: e.firstLab, last: e.lastLab, delta: Math.round((e.lastLab.val - e.firstLab.val) * 10) / 10 });
        }
      }
      return out;
    },
  },
  {
    id: "AQL-15",
    category: "C",
    title: "Median-magnitude per diagnosgrupp (proxy för populationsstatistik)",
    description:
      "Per profil: median av magnitudvärden från lab_result-compositions. Client-side aggregering.",
    aql: `SELECT e/ehr_id/value, c/composer/name
FROM EHR e
CONTAINS COMPOSITION c
WHERE c/composer/name LIKE '*lab_result*'`,
    postProcess: (rows) => {
      const byProfile = new Map<string, number[]>();
      for (const r of rows) {
        const name = String((r as unknown[])[1]);
        const m = name.match(/(\d+(?:\.\d+)?)\s+(mmol\/mol|g\/L|mg\/L|umol\/L|%)/);
        if (!m) continue;
        const val = Number(m[1]);
        // Profile lives in problem_diagnosis annotation — for proxy we just bucket by lab type.
        const typeMatch = name.match(/\|\s+([A-Z0-9_]+)\s+\|/);
        const bucket = typeMatch ? typeMatch[1] : "other";
        const arr = byProfile.get(bucket) ?? [];
        arr.push(val);
        byProfile.set(bucket, arr);
      }
      const out: unknown[] = [];
      for (const [bucket, arr] of byProfile.entries()) {
        arr.sort((a, b) => a - b);
        out.push({
          bucket,
          n: arr.length,
          median: arr[Math.floor(arr.length / 2)],
          min: arr[0],
          max: arr[arr.length - 1],
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

// Synthetic-bulk-loader för Del 2 / B4.
//
// VARFÖR EJ SYNTHEA?
// Synthea är en utmärkt syntetisk EHR-generator MEN kräver Java-toolchain + flera
// minuter setup på CarliusFyra. Vår interna syntetiserare följer samma Nimloth-
// pattern som services/data-generator (seedrandom-baserad determinism) och
// producerar deterministiskt en pålastad bredd som är *uttalat preloaded* via
// _source-kolumnen. Ärligheten i demon är att bredden ÄR pålastad — inte att
// den maskerar verkligt-data. Då är vår egen syntetiserare lika trovärdig.
//
// Determinism: en master-seed → per person räknas en sub-seed → alla random calls
// för den personen blir reproducerbara. Body-mass-distributioner approximeras
// med Box-Muller-inverteringen på uniform input.
//
// Output: arrays med rad-objekt redo för batch-INSERT.

import seedrandom from 'seedrandom';

export interface SyntheticPerson {
  person_id: number;
  person_source_value: string;
  gender_source_value: string;
  year_of_birth: number;
}

export interface SyntheticDrugExposure {
  person_id: number;
  drug_exposure_start_date: string;
  drug_exposure_start_datetime: string;
  drug_source_value: string;
  sig: string;
}

export interface SyntheticMeasurement {
  person_id: number;
  measurement_date: string;
  measurement_datetime: string;
  value_as_number: number;
  unit_source_value: string;
  measurement_source_value: string;
}

// ---- Vokabulär (medvetet smal — demo-trovärdighet > realism) -----------
const ATC_TABLE = [
  { code: 'A10BA02', sig: 'Metformin 500 mg x 2', prob: 0.18 },        // T2D
  { code: 'C10AA01', sig: 'Simvastatin 20 mg x 1', prob: 0.22 },       // statin
  { code: 'C09AA02', sig: 'Enalapril 10 mg x 1', prob: 0.15 },         // ACE-i
  { code: 'C07AB02', sig: 'Metoprolol 50 mg x 2', prob: 0.13 },        // beta-blocker
  { code: 'A02BC01', sig: 'Omeprazol 20 mg x 1', prob: 0.20 },         // PPI
  { code: 'B01AA03', sig: 'Warfarin 2.5 mg variabelt', prob: 0.05 },   // warfarin
  { code: 'N02BE01', sig: 'Paracetamol 1 g v.b.', prob: 0.30 },        // smärta
  { code: 'M01AE01', sig: 'Ibuprofen 400 mg v.b.', prob: 0.10 },       // NSAID
  { code: 'A10AB01', sig: 'Insulin aspart enligt schema', prob: 0.03 },// insulin
  { code: 'J01CA04', sig: 'Amoxicillin 500 mg x 3', prob: 0.08 },      // antibiotika
];

// Lab-analyter med realistiska intervall (mean ± sd) + ev. patologisk svans
const ANALYTE_TABLE: Array<{
  code: string; unit: string; mean: number; sd: number;
  prob: number; pathoTail?: { prob: number; mean: number; sd: number };
}> = [
  { code: 'HBA1C', unit: 'mmol/mol', mean: 42, sd: 6, prob: 0.45,
    pathoTail: { prob: 0.20, mean: 65, sd: 12 } },                         // diabetiker-tail
  { code: 'EGFR', unit: 'mL/min/1.73m²', mean: 85, sd: 18, prob: 0.55,
    pathoTail: { prob: 0.12, mean: 45, sd: 12 } },                         // CKD-tail
  { code: 'CRE', unit: 'µmol/L', mean: 75, sd: 18, prob: 0.50 },           // kreatinin
  { code: 'INR', unit: 'INR', mean: 1.0, sd: 0.1, prob: 0.06,
    pathoTail: { prob: 0.85, mean: 2.5, sd: 0.5 } },                       // warfarin-paneler
  { code: 'LDL', unit: 'mmol/L', mean: 3.0, sd: 0.8, prob: 0.30 },         // lipid
  { code: 'ALT', unit: 'U/L', mean: 25, sd: 12, prob: 0.18 },              // leverenzym
  { code: 'K', unit: 'mmol/L', mean: 4.2, sd: 0.4, prob: 0.40 },           // kalium
  { code: 'NA', unit: 'mmol/L', mean: 140, sd: 3, prob: 0.40 },            // natrium
  { code: 'GLU', unit: 'mmol/L', mean: 5.5, sd: 1.2, prob: 0.30 },         // p-glukos
  { code: 'CRP', unit: 'mg/L', mean: 4, sd: 8, prob: 0.20 },               // inflammation
];

// ----------- Hjälpare ---------------------------------------------------

function rngFor(seed: string): seedrandom.PRNG {
  return seedrandom(seed);
}

/** Box-Muller — normal-fördelad sampling från uniform PRNG. */
function nextNormal(rng: seedrandom.PRNG, mean: number, sd: number): number {
  const u1 = rng();
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1 || 1e-9)) * Math.cos(2 * Math.PI * u2);
  return mean + z * sd;
}

/** Poisson-sampling via Knuth's algoritm — bra för små λ. */
function nextPoisson(rng: seedrandom.PRNG, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

function dateBetween(rng: seedrandom.PRNG, from: Date, to: Date): Date {
  const t = from.getTime() + rng() * (to.getTime() - from.getTime());
  return new Date(t);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoDatetime(d: Date): string {
  return d.toISOString();
}

// ----------- Person-generator ------------------------------------------

export interface BulkGenerateOptions {
  size: number;
  personIdOffset: number;
  masterSeed: string;
  dateFrom: string;
  dateTo: string;
}

export interface BulkGenerated {
  persons: SyntheticPerson[];
  drugExposures: SyntheticDrugExposure[];
  measurements: SyntheticMeasurement[];
}

/**
 * Generera deterministisk bredd. Returnerar arrays redo för batch-INSERT.
 *
 * Deterministik-kontrakt: samma masterSeed + samma size → IDENTISKT output
 * inklusive person_id-mappning till profiler/tail-distributioner.
 */
export function generateBulk(opts: BulkGenerateOptions): BulkGenerated {
  const persons: SyntheticPerson[] = [];
  const drugExposures: SyntheticDrugExposure[] = [];
  const measurements: SyntheticMeasurement[] = [];

  const from = new Date(opts.dateFrom);
  const to = new Date(opts.dateTo);

  // Master-rng styr per-person sub-seeds → varje person blir reproducerbar.
  const masterRng = rngFor(opts.masterSeed);

  for (let i = 0; i < opts.size; i++) {
    const personId = opts.personIdOffset + i;
    const personSeed = `${opts.masterSeed}::p${i}::${masterRng().toFixed(10)}`;
    const rng = rngFor(personSeed);

    const gender = rng() < 0.5 ? 'M' : 'F';
    const age = Math.max(18, Math.min(95, Math.round(nextNormal(rng, 58, 18))));
    const yob = new Date(opts.dateTo).getUTCFullYear() - age;

    persons.push({
      person_id: personId,
      person_source_value: `bulk-${String(i + 1).padStart(7, '0')}`,
      gender_source_value: gender,
      year_of_birth: yob,
    });

    // ----- Drug exposures: per ATC → kasta tärning ----------------------
    for (const atc of ATC_TABLE) {
      if (rng() < atc.prob) {
        const expCount = 1 + nextPoisson(rng, 0.5); // 1 (oftast) eller 2-3
        for (let k = 0; k < expCount; k++) {
          const d = dateBetween(rng, from, to);
          drugExposures.push({
            person_id: personId,
            drug_exposure_start_date: isoDate(d),
            drug_exposure_start_datetime: isoDatetime(d),
            drug_source_value: atc.code,
            sig: atc.sig,
          });
        }
      }
    }

    // ----- Measurements: per analyt → kasta tärning + ev. patologisk ----
    for (const an of ANALYTE_TABLE) {
      if (rng() < an.prob) {
        const usePatho = an.pathoTail && rng() < an.pathoTail.prob;
        const params = usePatho ? an.pathoTail! : an;
        const measCount = 1 + nextPoisson(rng, 0.7); // 1-3 mätningar per analyt
        for (let k = 0; k < measCount; k++) {
          const d = dateBetween(rng, from, to);
          let val = nextNormal(rng, params.mean, params.sd);
          // Klipp till rimliga gränser (icke-negativ, dec-precision)
          val = Math.max(0.01, Math.round(val * 10) / 10);
          measurements.push({
            person_id: personId,
            measurement_date: isoDate(d),
            measurement_datetime: isoDatetime(d),
            value_as_number: val,
            unit_source_value: an.unit,
            measurement_source_value: an.code,
          });
        }
      }
    }
  }

  return { persons, drugExposures, measurements };
}

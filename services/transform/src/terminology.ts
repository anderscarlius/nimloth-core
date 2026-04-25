// Terminologitjänst med hårdkodade mappningstabeller.
// Produktion skulle hämta dessa från Snomed-terminologiserver eller SLS.

/** Systems (kodsystem-URI:er). */
export const SYS = {
  snomed: 'http://snomed.info/sct',
  loinc: 'http://loinc.org',
  icd10se: 'http://hl7.org/fhir/sid/icd-10-se',
  atc: 'http://whocc.no/atc',
  kva: 'http://klassifikationer.socialstyrelsen.se/kva',
  ucum: 'http://unitsofmeasure.org',
  npu: 'https://www.npu-terminology.org',
};

// ============================================================
// Vitala parametrar: Melior OBSERVATION_TYPE → Snomed CT
// ============================================================
export const VITALS_SNOMED: Record<string, { code: string; display: string }> = {
  BLOOD_PRESSURE: { code: '75367002', display: 'Blood pressure' },
  HEART_RATE: { code: '364075005', display: 'Heart rate' },
  TEMPERATURE: { code: '386725007', display: 'Body temperature' },
  SPO2: { code: '431314004', display: 'Oxygen saturation' },
  RESPIRATORY_RATE: { code: '86290005', display: 'Respiratory rate' },
  WEIGHT: { code: '27113001', display: 'Body weight' },
  HEIGHT: { code: '50373000', display: 'Body height' },
};

export const VITALS_BP_COMPONENTS = {
  systolic: { code: '271649006', display: 'Systolic blood pressure' },
  diastolic: { code: '271650006', display: 'Diastolic blood pressure' },
};

// ============================================================
// Enheter: Melior → UCUM
// ============================================================
export const UCUM_UNITS: Record<string, string> = {
  mmHg: 'mm[Hg]',
  bpm: '/min',
  '/min': '/min',
  '°C': 'Cel',
  C: 'Cel',
  '%': '%',
  kg: 'kg',
  cm: 'cm',
  'g/L': 'g/L',
  'mg/L': 'mg/L',
  'µmol/L': 'umol/L',
  'mmol/mol': 'mmol/mol',
  'mL/min': 'mL/min',
};

export function toUcum(unit: string | null | undefined): string {
  if (!unit) return '';
  return UCUM_UNITS[unit] ?? unit;
}

// ============================================================
// Lab: NPU-kod → LOINC
// ============================================================
export const NPU_TO_LOINC: Record<string, { code: string; display: string }> = {
  NPU01685: { code: '718-7', display: 'Hemoglobin [Mass/volume] in Blood' },
  NPU19748: { code: '1988-5', display: 'C reactive protein [Mass/volume] in Serum or Plasma' },
  NPU04206: { code: '6301-6', display: 'INR in Platelet poor plasma by Coagulation assay' },
  NPU03577: { code: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma' },
  NPU28289: { code: '7799-0', display: 'D-Dimer [Mass/volume] in Platelet poor plasma' },
  NPU27300: { code: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood' },
  NPU21531: { code: '33914-3', display: 'Glomerular filtration rate/1.73 sq M' },
};

export function npuToLoinc(npu: string | null | undefined): { code: string; display: string } | null {
  if (!npu) return null;
  return NPU_TO_LOINC[npu] ?? null;
}

// ============================================================
// Procedurer: KVÅ → Snomed CT
// ============================================================
export const KVA_TO_SNOMED: Record<string, { code: string; display: string }> = {
  NFB49: { code: '52734007', display: 'Total replacement of hip' },
  NFB29: { code: '179294005', display: 'Total replacement of hip joint using cement' },
  NGB09: { code: '112702004', display: 'Partial replacement of hip joint' },
  NFJ79: { code: '179345003', display: 'Revision of total hip replacement' },
};

export function kvaToSnomed(kva: string | null | undefined): { code: string; display: string } | null {
  if (!kva) return null;
  return KVA_TO_SNOMED[kva] ?? null;
}

// ============================================================
// Allergen: Fritext → Snomed CT (enkel lookup)
// ============================================================
export const ALLERGEN_SNOMED: Record<string, { code: string; display: string }> = {
  Penicillin: { code: '373270004', display: 'Penicillin' },
  'Pc-V': { code: '373270004', display: 'Penicillin' },
  Latex: { code: '37168000', display: 'Natural rubber latex' },
  Jordnöt: { code: '91934008', display: 'Peanut' },
  Sulfa: { code: '48709008', display: 'Sulfonamide' },
};

export function allergenToSnomed(text: string | null | undefined): { code: string; display: string } | null {
  if (!text) return null;
  return ALLERGEN_SNOMED[text] ?? null;
}

// ============================================================
// Diagnosis-type → Snomed CT qualifier
// ============================================================
export const DIAGNOSIS_TYPE_SNOMED: Record<string, { code: string; display: string }> = {
  PRIMARY: { code: '63161005', display: 'Primary diagnosis' },
  SECONDARY: { code: '2603003', display: 'Secondary diagnosis' },
  COMPLICATION: { code: '116223007', display: 'Complication' },
  CHRONIC: { code: '90734009', display: 'Chronic' },
};

import type { AsynjaPatientData, PatientData } from './types.js';

// ============================================================
// TestPatient (legacy export från Del 1 — behålls för bakåtkompatibilitet)
// ============================================================
export interface TestPatient {
  personnummer: string;
  fornamn: string;
  efternamn: string;
  kon: 'M' | 'F';
}

// ============================================================
// FRU ANDERSSON — HUVUDSCENARIO
// Ingrid Andersson, 19500315-2384, 74 år, Klippgatan 12, 413 14 Göteborg.
//
// Historik i Melior SU:
//  1. 2024-03-10 OUTPATIENT ortopedmottagning → M16.1 + remiss
//  2. 2025-03-15 INPATIENT ortopedavdelning → höftprotes NFB49 → DVT I82.4 → utskrivning
//  3. 2025-05-05 OUTPATIENT uppföljning
//
// I AsynjaVisph (primärvård) — kroniska diagnoser och aktuella läkemedel.
// ============================================================

const HSA_LINDQVIST = 'SE123456789';   // Dr. Erik Lindqvist, ortopedkirurg
const HSA_ORTHO_MD = 'SE987654321';    // Ortopedläkare mottagning
const HSA_GP_HOLM = 'SE555444333';     // Dr. Holm, primärvård
const HSA_PHYSIO = 'SE111222333';      // Fysioterapeut

export const FRU_ANDERSSON_MELIOR: PatientData = {
  personnummer: '19500315-2384',
  fornamn: 'Ingrid',
  efternamn: 'Andersson',
  fodelsedatum: '1950-03-15',
  kon: 'K',
  adress: 'Klippgatan 12',
  postnr: '41314',
  postort: 'Göteborg',
  telefon: '031-7654321',
  allergies: [
    {
      allergen: 'Penicillin',
      reaction: 'Urtikaria',
      severity: 'MODERATE',
      verified: true,
      reported_by_hsa: HSA_GP_HOLM,
      reported_at: '2015-01-10 10:00',
    },
  ],
  encounters: [
    // ------------- 1. OUTPATIENT 2024-03-10 ortopedmottagning -------------
    {
      encounter_type: 'OUTPATIENT',
      department_code: 'SU-ORT-MOT',
      department_name: 'Ortopedmottagning SU Mölndal',
      admitting_doctor_hsa: HSA_ORTHO_MD,
      admitting_doctor_name: 'Dr. Anna Lind',
      admission_date: '2024-03-10 09:15',
      discharge_date: '2024-03-10 10:30',
      status: 'DISCHARGED',
      diagnoses: [
        {
          icd_code: 'M16.1',
          diagnosis_text: 'Primär koxartros, höger',
          diagnosis_type: 'PRIMARY',
          diagnosed_by_hsa: HSA_ORTHO_MD,
          diagnosed_at: '2024-03-10 10:00',
        },
      ],
      clinical_notes: [
        {
          note_type: 'CONSULTATION',
          department_code: 'SU-ORT-MOT',
          author_hsa: HSA_ORTHO_MD,
          author_name: 'Dr. Anna Lind',
          author_role: 'PHYSICIAN',
          content:
            'Patienten remitterad från VC pga tilltagande höftsmärta höger sedan 6 mån. Röntgen visar avancerad artros. Planeras för total höftprotesoperation.',
          signed: true,
          signed_at: '2024-03-10 10:30',
        },
      ],
      referrals: [
        {
          from_department: 'SU-ORT-MOT',
          to_department: 'SU-ORT-AVD',
          referral_reason: 'Planerad total höftprotes höger för M16.1.',
          priority: 'ROUTINE',
          status: 'ACCEPTED',
          referring_doctor_hsa: HSA_ORTHO_MD,
          sent_at: '2024-03-10 10:35',
        },
      ],
    },
    // ------------- 2. INPATIENT 2025-03-15 → 2025-03-25 -------------
    {
      encounter_type: 'INPATIENT',
      department_code: 'SU-ORT-AVD',
      department_name: 'Ortopedavdelning SU Mölndal',
      admitting_doctor_hsa: HSA_LINDQVIST,
      admitting_doctor_name: 'Dr. Erik Lindqvist',
      admission_date: '2025-03-15 07:00',
      discharge_date: '2025-03-25 13:00',
      discharge_diagnosis_icd: 'M16.1',
      status: 'DISCHARGED',
      observations: [
        // Dag 0 — preop
        { observation_type: 'BLOOD_PRESSURE', value_numeric: 145, value_numeric2: 82, unit: 'mmHg', recorded_by_hsa: HSA_LINDQVIST, recorded_at: '2025-03-15 07:30' },
        { observation_type: 'HEART_RATE', value_numeric: 78, unit: 'bpm', recorded_by_hsa: HSA_LINDQVIST, recorded_at: '2025-03-15 07:30' },
        { observation_type: 'TEMPERATURE', value_numeric: 36.8, unit: '°C', recorded_by_hsa: HSA_LINDQVIST, recorded_at: '2025-03-15 07:30' },
        { observation_type: 'SPO2', value_numeric: 97, unit: '%', recorded_by_hsa: HSA_LINDQVIST, recorded_at: '2025-03-15 07:30' },
        // Dag 3 — postop DVT
        { observation_type: 'BLOOD_PRESSURE', value_numeric: 138, value_numeric2: 78, unit: 'mmHg', recorded_by_hsa: HSA_LINDQVIST, recorded_at: '2025-03-18 08:00' },
        { observation_type: 'HEART_RATE', value_numeric: 92, unit: 'bpm', recorded_by_hsa: HSA_LINDQVIST, recorded_at: '2025-03-18 08:00' },
        { observation_type: 'TEMPERATURE', value_numeric: 37.6, unit: '°C', recorded_by_hsa: HSA_LINDQVIST, recorded_at: '2025-03-18 08:00' },
      ],
      lab_results: [
        { order_id: 'SU-LAB-2025-031501', analysis_code: 'NPU01685', analysis_name: 'Hemoglobin', value_numeric: 128, unit: 'g/L', reference_low: 117, reference_high: 153, ordering_doctor_hsa: HSA_LINDQVIST, lab_system_code: 'FLEXLAB-SU', sample_collected_at: '2025-03-15 06:00', result_available_at: '2025-03-15 07:00' },
        { order_id: 'SU-LAB-2025-031501', analysis_code: 'NPU19748', analysis_name: 'CRP', value_numeric: 5, unit: 'mg/L', reference_high: 10, ordering_doctor_hsa: HSA_LINDQVIST, lab_system_code: 'FLEXLAB-SU', sample_collected_at: '2025-03-15 06:00', result_available_at: '2025-03-15 07:15' },
        { order_id: 'SU-LAB-2025-031501', analysis_code: 'NPU04206', analysis_name: 'P-INR', value_numeric: 1.0, unit: '', reference_low: 0.8, reference_high: 1.2, ordering_doctor_hsa: HSA_LINDQVIST, lab_system_code: 'FLEXLAB-SU', sample_collected_at: '2025-03-15 06:00', result_available_at: '2025-03-15 07:10' },
        // Postop komplikation DVT
        { order_id: 'SU-LAB-2025-031801', analysis_code: 'NPU28289', analysis_name: 'D-dimer', value_numeric: 4.2, unit: 'mg/L', reference_high: 0.5, flag: 'H', ordering_doctor_hsa: HSA_LINDQVIST, lab_system_code: 'FLEXLAB-SU', sample_collected_at: '2025-03-18 07:30', result_available_at: '2025-03-18 08:15' },
        { order_id: 'SU-LAB-2025-031801', analysis_code: 'NPU19748', analysis_name: 'CRP', value_numeric: 85, unit: 'mg/L', reference_high: 10, flag: 'H', ordering_doctor_hsa: HSA_LINDQVIST, lab_system_code: 'FLEXLAB-SU', sample_collected_at: '2025-03-18 07:30', result_available_at: '2025-03-18 08:20' },
      ],
      prescriptions: [
        // Postop trombosprofylax (byts senare)
        { drug_name: 'Fragmin', atc_code: 'B01AB04', strength: '5000 E', dosage: '1x1', route: 'SC', frequency: 'DAILY', start_date: '2025-03-15', end_date: '2025-03-18', prescribing_doctor_hsa: HSA_LINDQVIST, status: 'COMPLETED' },
        { drug_name: 'Paracetamol', atc_code: 'N02BE01', strength: '1 g', dosage: '1x4', route: 'PO', frequency: 'QID', start_date: '2025-03-15', end_date: '2025-03-25', prescribing_doctor_hsa: HSA_LINDQVIST, status: 'COMPLETED' },
        // Waran efter DVT
        { drug_name: 'Waran', atc_code: 'B01AA03', strength: '2.5 mg', dosage: '1x1', route: 'PO', frequency: 'DAILY', start_date: '2025-03-18', prescribing_doctor_hsa: HSA_LINDQVIST, status: 'ACTIVE' },
      ],
      procedures: [
        {
          procedure_code_kva: 'NFB49',
          procedure_name: 'Total höftprotesplastik, höger',
          laterality: 'RIGHT',
          implant_type: 'CEMENTED',
          implant_manufacturer: 'Zimmer Biomet',
          implant_model: 'Avenir Complete',
          implant_size: 'Size 3 stem, 52mm cup',
          performing_surgeon_hsa: HSA_LINDQVIST,
          performing_surgeon_name: 'Dr. Erik Lindqvist',
          procedure_date: '2025-03-15 08:30',
          duration_minutes: 95,
          anesthesia_type: 'SPINAL',
        },
      ],
      diagnoses: [
        { icd_code: 'M16.1', diagnosis_text: 'Primär koxartros, höger', diagnosis_type: 'PRIMARY', diagnosed_by_hsa: HSA_LINDQVIST, diagnosed_at: '2025-03-15 07:00' },
        { icd_code: 'Z96.64', diagnosis_text: 'Höftledsprotes in situ', diagnosis_type: 'SECONDARY', diagnosed_by_hsa: HSA_LINDQVIST, diagnosed_at: '2025-03-15 15:00' },
        { icd_code: 'I82.4', diagnosis_text: 'DVT, djup ventrombos i v. poplitea sin', diagnosis_type: 'COMPLICATION', diagnosed_by_hsa: HSA_LINDQVIST, diagnosed_at: '2025-03-18 09:00' },
      ],
      clinical_notes: [
        {
          note_type: 'ADMISSION_NOTE',
          department_code: 'SU-ORT-AVD',
          author_hsa: HSA_LINDQVIST,
          author_name: 'Dr. Erik Lindqvist',
          author_role: 'PHYSICIAN',
          content: 'Inskrivning för planerad total höftprotes höger. Patienten i gott skick. Planerat NFB49 idag.',
          signed: true,
          signed_at: '2025-03-15 07:30',
        },
        {
          note_type: 'OP_REPORT',
          department_code: 'SU-ORT-AVD',
          author_hsa: HSA_LINDQVIST,
          author_name: 'Dr. Erik Lindqvist',
          author_role: 'PHYSICIAN',
          content: 'Total höftprotes höger utförd enligt plan. Zimmer Biomet Avenir Complete, cementerad, storlek 3 stem/52mm cup. Okomplicerat förlopp. Duration 95 min.',
          signed: true,
          signed_at: '2025-03-15 10:30',
        },
        {
          note_type: 'PROGRESS_NOTE',
          department_code: 'SU-ORT-AVD',
          author_hsa: HSA_LINDQVIST,
          author_name: 'Dr. Erik Lindqvist',
          author_role: 'PHYSICIAN',
          content: 'Ultraljud verifierar DVT i v. poplitea sin. Insätter Waran med Fragmin-brygga. Mål-INR 2.0-3.0.',
          signed: true,
          signed_at: '2025-03-18 09:30',
        },
        {
          note_type: 'PHYSIOTHERAPY',
          department_code: 'SU-ORT-AVD',
          author_hsa: HSA_PHYSIO,
          author_name: 'Karin Nilsson',
          author_role: 'PHYSIOTHERAPIST',
          content:
            'Baslinjefunktion: gångförmåga 50m rollator, trappkapacitet en trappa med stöd, ADL mestadels självständig.',
          signed: true,
          signed_at: '2025-03-24 15:00',
        },
        {
          note_type: 'DISCHARGE_SUMMARY',
          department_code: 'SU-ORT-AVD',
          author_hsa: HSA_LINDQVIST,
          author_name: 'Dr. Erik Lindqvist',
          author_role: 'PHYSICIAN',
          content:
            'Utskrivning efter total höftprotes höger med postop DVT. Läkemedel vid utskrivning: Waran 2.5mg 1x1, Paracetamol vid behov. Patienten mobiliserad med rollator. Kan gå 50m med rollator. Trappgång med stöd av en person. Planerad uppföljning ortopedmottagning 6v.',
          signed: true,
          signed_at: '2025-03-25 12:00',
        },
      ],
    },
    // ------------- 3. OUTPATIENT 2025-05-05 uppföljning -------------
    {
      encounter_type: 'OUTPATIENT',
      department_code: 'SU-ORT-MOT',
      department_name: 'Ortopedmottagning SU Mölndal',
      admitting_doctor_hsa: HSA_LINDQVIST,
      admitting_doctor_name: 'Dr. Erik Lindqvist',
      admission_date: '2025-05-05 10:00',
      discharge_date: '2025-05-05 10:45',
      status: 'DISCHARGED',
      lab_results: [
        { order_id: 'SU-LAB-2025-050501', analysis_code: 'NPU04206', analysis_name: 'P-INR', value_numeric: 2.4, unit: '', reference_low: 2.0, reference_high: 3.0, ordering_doctor_hsa: HSA_LINDQVIST, lab_system_code: 'FLEXLAB-SU', sample_collected_at: '2025-05-05 09:00', result_available_at: '2025-05-05 09:45' },
      ],
      clinical_notes: [
        {
          note_type: 'PROGRESS_NOTE',
          department_code: 'SU-ORT-MOT',
          author_hsa: HSA_LINDQVIST,
          author_name: 'Dr. Erik Lindqvist',
          author_role: 'PHYSICIAN',
          content:
            'Kontroll 6v postop. Röntgen visar protesen i gott läge. Såret läkt. Inga tecken på lossning. Pat anger förbättrad funktion. Gångförmåga 200m utan hjälpmedel.',
          signed: true,
          signed_at: '2025-05-05 10:45',
        },
      ],
    },
  ],
};

export const FRU_ANDERSSON_ASYNJA: AsynjaPatientData = {
  personnummer: '19500315-2384',
  fornamn: 'Ingrid',
  efternamn: 'Andersson',
  fodelsedatum: '1950-03-15',
  kon: 'K',
  adress: 'Klippgatan 12',
  postnr: '41314',
  postort: 'Göteborg',
  telefon: '031-7654321',
  allergies: [
    {
      allergen: 'Penicillin',
      reaction: 'Urtikaria',
      severity: 'MODERATE',
      verified: true,
      reported_by_hsa: HSA_GP_HOLM,
      reported_at: '2015-01-10 10:00',
    },
  ],
  diagnoses: [
    { icd_code: 'I48.0', diagnosis_text: 'Förmaksflimmer', diagnosis_type: 'CHRONIC', diagnosed_by_hsa: HSA_GP_HOLM, diagnosed_at: '2020-06-15 10:00' },
    { icd_code: 'I10', diagnosis_text: 'Essentiell hypertoni', diagnosis_type: 'CHRONIC', diagnosed_by_hsa: HSA_GP_HOLM, diagnosed_at: '2018-09-20 14:30' },
    { icd_code: 'E11', diagnosis_text: 'Diabetes mellitus typ 2', diagnosis_type: 'CHRONIC', diagnosed_by_hsa: HSA_GP_HOLM, diagnosed_at: '2019-04-10 11:00' },
  ],
  prescriptions: [
    { drug_name: 'Waran', atc_code: 'B01AA03', strength: '2.5 mg', dosage: '1x1', route: 'PO', frequency: 'DAILY', start_date: '2025-03-25', prescribing_doctor_hsa: HSA_GP_HOLM, status: 'ACTIVE' },
    { drug_name: 'Metoprolol', atc_code: 'C07AB02', strength: '50 mg', dosage: '1x1', route: 'PO', frequency: 'DAILY', start_date: '2020-06-20', prescribing_doctor_hsa: HSA_GP_HOLM, status: 'ACTIVE' },
    { drug_name: 'Ramipril', atc_code: 'C09AA05', strength: '5 mg', dosage: '1x1', route: 'PO', frequency: 'DAILY', start_date: '2018-10-01', prescribing_doctor_hsa: HSA_GP_HOLM, status: 'ACTIVE' },
    { drug_name: 'Metformin', atc_code: 'A10BA02', strength: '500 mg', dosage: '1x2', route: 'PO', frequency: 'BID', start_date: '2019-04-15', prescribing_doctor_hsa: HSA_GP_HOLM, status: 'ACTIVE' },
  ],
  encounters: [
    {
      clinic_code: 'VC-Slottsskogen',
      clinic_name: 'VC Slottsskogen',
      visit_doctor_hsa: HSA_GP_HOLM,
      visit_doctor_name: 'Dr. Lars Holm',
      visit_date: '2025-10-15 09:30',
      visit_reason: 'Årskontroll diabetes',
      status: 'COMPLETED',
    },
  ],
};

// ============================================================
// BULK-PATIENTER — template
// ============================================================
function bulkMeliorPatient(
  personnummer: string,
  fornamn: string,
  efternamn: string,
  kon: 'M' | 'K',
  fodelsedatum: string,
  postort: string,
  opts: {
    primary_icd: string;
    diagnosis_text: string;
    allergen?: string;
    drug: { name: string; atc: string; strength: string };
  },
): PatientData {
  const admDate = '2025-06-01 10:00';
  return {
    personnummer,
    fornamn,
    efternamn,
    fodelsedatum,
    kon,
    adress: 'Testvägen 1',
    postnr: '41201',
    postort,
    telefon: '070-0000000',
    allergies: opts.allergen
      ? [{ allergen: opts.allergen, reaction: 'Utslag', severity: 'MILD', verified: true, reported_by_hsa: HSA_GP_HOLM, reported_at: '2020-01-01 10:00' }]
      : [],
    encounters: [
      {
        encounter_type: 'OUTPATIENT',
        department_code: 'SU-INT-MOT',
        department_name: 'Internmedicinsk mottagning SU',
        admitting_doctor_hsa: HSA_ORTHO_MD,
        admitting_doctor_name: 'Dr. M. Testsson',
        admission_date: admDate,
        discharge_date: '2025-06-01 11:00',
        status: 'DISCHARGED',
        observations: [
          { observation_type: 'BLOOD_PRESSURE', value_numeric: 130, value_numeric2: 80, unit: 'mmHg', recorded_at: admDate },
          { observation_type: 'HEART_RATE', value_numeric: 72, unit: 'bpm', recorded_at: admDate },
          { observation_type: 'TEMPERATURE', value_numeric: 36.7, unit: '°C', recorded_at: admDate },
          { observation_type: 'SPO2', value_numeric: 98, unit: '%', recorded_at: admDate },
          { observation_type: 'RESPIRATORY_RATE', value_numeric: 16, unit: '/min', recorded_at: admDate },
        ],
        lab_results: [
          { analysis_code: 'NPU01685', analysis_name: 'Hemoglobin', value_numeric: 140, unit: 'g/L', reference_low: 117, reference_high: 153, lab_system_code: 'FLEXLAB-SU', sample_collected_at: admDate, result_available_at: admDate },
          { analysis_code: 'NPU19748', analysis_name: 'CRP', value_numeric: 4, unit: 'mg/L', reference_high: 10, lab_system_code: 'FLEXLAB-SU', sample_collected_at: admDate, result_available_at: admDate },
          { analysis_code: 'NPU03577', analysis_name: 'Kreatinin', value_numeric: 78, unit: 'µmol/L', reference_low: 45, reference_high: 90, lab_system_code: 'FLEXLAB-SU', sample_collected_at: admDate, result_available_at: admDate },
        ],
        prescriptions: [
          { drug_name: opts.drug.name, atc_code: opts.drug.atc, strength: opts.drug.strength, dosage: '1x1', route: 'PO', frequency: 'DAILY', start_date: '2025-06-01', status: 'ACTIVE' },
          { drug_name: 'Paracetamol', atc_code: 'N02BE01', strength: '500 mg', dosage: '1-2x3', route: 'PO', frequency: 'PRN', start_date: '2025-06-01', status: 'ACTIVE' },
        ],
        diagnoses: [
          { icd_code: opts.primary_icd, diagnosis_text: opts.diagnosis_text, diagnosis_type: 'PRIMARY', diagnosed_at: admDate },
        ],
        clinical_notes: [
          { note_type: 'CONSULTATION', department_code: 'SU-INT-MOT', author_role: 'PHYSICIAN', content: `Rutinkontroll för ${opts.diagnosis_text}.`, signed: true, signed_at: admDate },
        ],
      },
      {
        encounter_type: 'OUTPATIENT',
        department_code: 'SU-INT-MOT',
        department_name: 'Internmedicinsk mottagning SU',
        admitting_doctor_hsa: HSA_ORTHO_MD,
        admitting_doctor_name: 'Dr. M. Testsson',
        admission_date: '2025-09-15 10:00',
        discharge_date: '2025-09-15 10:30',
        status: 'DISCHARGED',
        observations: [
          { observation_type: 'BLOOD_PRESSURE', value_numeric: 128, value_numeric2: 78, unit: 'mmHg', recorded_at: '2025-09-15 10:00' },
        ],
        diagnoses: [
          { icd_code: opts.primary_icd, diagnosis_text: opts.diagnosis_text, diagnosis_type: 'PRIMARY', diagnosed_at: '2025-09-15 10:00' },
        ],
      },
    ],
  };
}

function bulkAsynjaPatient(
  personnummer: string,
  fornamn: string,
  efternamn: string,
  kon: 'M' | 'K',
  fodelsedatum: string,
  postort: string,
  opts: { primary_icd: string; diagnosis_text: string; drug: { name: string; atc: string; strength: string } },
): AsynjaPatientData {
  return {
    personnummer,
    fornamn,
    efternamn,
    fodelsedatum,
    kon,
    adress: 'Testvägen 1',
    postnr: '41201',
    postort,
    telefon: '070-0000000',
    diagnoses: [
      { icd_code: opts.primary_icd, diagnosis_text: opts.diagnosis_text, diagnosis_type: 'CHRONIC', diagnosed_by_hsa: HSA_GP_HOLM, diagnosed_at: '2022-01-01 10:00' },
    ],
    prescriptions: [
      { drug_name: opts.drug.name, atc_code: opts.drug.atc, strength: opts.drug.strength, dosage: '1x1', route: 'PO', frequency: 'DAILY', start_date: '2022-01-01', prescribing_doctor_hsa: HSA_GP_HOLM, status: 'ACTIVE' },
      { drug_name: 'Simvastatin', atc_code: 'C10AA01', strength: '20 mg', dosage: '1x1', route: 'PO', frequency: 'DAILY', start_date: '2022-01-01', prescribing_doctor_hsa: HSA_GP_HOLM, status: 'ACTIVE' },
    ],
    encounters: [
      { clinic_code: 'VC-Test', clinic_name: 'Vårdcentral Test', visit_doctor_hsa: HSA_GP_HOLM, visit_doctor_name: 'Dr. Lars Holm', visit_date: '2025-04-10 09:00', visit_reason: 'Årskontroll', status: 'COMPLETED' },
      { clinic_code: 'VC-Test', clinic_name: 'Vårdcentral Test', visit_doctor_hsa: HSA_GP_HOLM, visit_doctor_name: 'Dr. Lars Holm', visit_date: '2025-10-10 09:00', visit_reason: 'Receptförnyelse', status: 'COMPLETED' },
    ],
  };
}

// ============================================================
// 10 YTTERLIGARE PATIENTER
// Fördelning: 3 only-Melior, 3 only-AsynjaVisph, 2 both, 1 spärr, 1 nödöppning
// Extra i Melior (för att nå ≥ 11 totalt i Melior).
// ============================================================

// Only Melior (3)
const MELIOR_ONLY_1 = bulkMeliorPatient('19420512-1234', 'Gunnar', 'Persson', 'M', '1942-05-12', 'Göteborg', { primary_icd: 'I25.9', diagnosis_text: 'Kronisk ischemisk hjärtsjukdom', drug: { name: 'Atorvastatin', atc: 'C10AA05', strength: '40 mg' } });
const MELIOR_ONLY_2 = bulkMeliorPatient('19680822-5678', 'Maria', 'Johansson', 'K', '1968-08-22', 'Mölndal', { primary_icd: 'J44.9', diagnosis_text: 'KOL, ospecificerad', drug: { name: 'Spiriva', atc: 'R03BB04', strength: '18 µg' }, allergen: 'Latex' });
const MELIOR_ONLY_3 = bulkMeliorPatient('19750304-9012', 'Johan', 'Nilsson', 'M', '1975-03-04', 'Göteborg', { primary_icd: 'K50.0', diagnosis_text: "Crohn's sjukdom, tunntarm", drug: { name: 'Azatioprin', atc: 'L04AX01', strength: '50 mg' } });

// Only AsynjaVisph (3)
const ASYNJA_ONLY_1 = bulkAsynjaPatient('19551118-3456', 'Karin', 'Svensson', 'K', '1955-11-18', 'Partille', { primary_icd: 'I10', diagnosis_text: 'Essentiell hypertoni', drug: { name: 'Ramipril', atc: 'C09AA05', strength: '5 mg' } });
const ASYNJA_ONLY_2 = bulkAsynjaPatient('19901212-7890', 'Erik', 'Larsson', 'M', '1990-12-12', 'Mölndal', { primary_icd: 'E11', diagnosis_text: 'Diabetes typ 2', drug: { name: 'Metformin', atc: 'A10BA02', strength: '500 mg' } });
const ASYNJA_ONLY_3 = bulkAsynjaPatient('19820707-2345', 'Anna', 'Karlsson', 'K', '1982-07-07', 'Göteborg', { primary_icd: 'F41.1', diagnosis_text: 'Generaliserat ångestsyndrom', drug: { name: 'Sertralin', atc: 'N06AB06', strength: '50 mg' } });

// Both systems (2) — Melior + Asynja
const BOTH_M_1 = bulkMeliorPatient('19450620-4567', 'Bengt', 'Lindgren', 'M', '1945-06-20', 'Göteborg', { primary_icd: 'I50.9', diagnosis_text: 'Hjärtsvikt', drug: { name: 'Furosemid', atc: 'C03CA01', strength: '40 mg' } });
const BOTH_A_1 = bulkAsynjaPatient('19450620-4567', 'Bengt', 'Lindgren', 'M', '1945-06-20', 'Göteborg', { primary_icd: 'I50.9', diagnosis_text: 'Hjärtsvikt', drug: { name: 'Enalapril', atc: 'C09AA02', strength: '10 mg' } });

const BOTH_M_2 = bulkMeliorPatient('19581005-6789', 'Eva', 'Berg', 'K', '1958-10-05', 'Göteborg', { primary_icd: 'N18.3', diagnosis_text: 'Kronisk njursjukdom stadium 3', drug: { name: 'Calciumkarbonat', atc: 'A12AA04', strength: '500 mg' } });
const BOTH_A_2 = bulkAsynjaPatient('19581005-6789', 'Eva', 'Berg', 'K', '1958-10-05', 'Göteborg', { primary_icd: 'N18.3', diagnosis_text: 'Kronisk njursjukdom stadium 3', drug: { name: 'Furosemid', atc: 'C03CA01', strength: '40 mg' } });

// Spärr-patient (endast Melior — PDL-spärr hanteras i core/patient_index, Prompt 9)
const SPARR_PATIENT = bulkMeliorPatient('19770918-1111', 'Sofia', 'Engstrom', 'K', '1977-09-18', 'Göteborg', { primary_icd: 'Z04.4', diagnosis_text: 'Observation efter trauma', drug: { name: 'Paracetamol', atc: 'N02BE01', strength: '500 mg' } });

// Nödöppning-patient (endast Melior)
const EMERGENCY_PATIENT = bulkMeliorPatient('19851203-2222', 'Peter', 'Holm', 'M', '1985-12-03', 'Göteborg', { primary_icd: 'S72.00', diagnosis_text: 'Femurfraktur ospecificerad', drug: { name: 'Morfin', atc: 'N02AA01', strength: '10 mg' } });

// Extra Melior-patienter (för att säkerställa ≥ 11 totalt i Melior)
const EXTRA_M_1 = bulkMeliorPatient('19620414-3333', 'Lena', 'Fransson', 'K', '1962-04-14', 'Göteborg', { primary_icd: 'M17.1', diagnosis_text: 'Primär gonartros, vänster', drug: { name: 'Diklofenak', atc: 'M01AB05', strength: '50 mg' } });
const EXTRA_M_2 = bulkMeliorPatient('19481030-4444', 'Sven', 'Olsson', 'M', '1948-10-30', 'Mölndal', { primary_icd: 'G20', diagnosis_text: 'Parkinsons sjukdom', drug: { name: 'Levodopa/Carbidopa', atc: 'N04BA02', strength: '100/25 mg' } });
const EXTRA_M_3 = bulkMeliorPatient('19720626-5555', 'Ulla', 'Wallin', 'K', '1972-06-26', 'Göteborg', { primary_icd: 'L40.0', diagnosis_text: 'Psoriasis vulgaris', drug: { name: 'Methotrexat', atc: 'L04AX03', strength: '10 mg' } });

// ============================================================
// EXPORT
// ============================================================
export const ALL_MELIOR_PATIENTS: PatientData[] = [
  FRU_ANDERSSON_MELIOR,
  MELIOR_ONLY_1,
  MELIOR_ONLY_2,
  MELIOR_ONLY_3,
  BOTH_M_1,
  BOTH_M_2,
  SPARR_PATIENT,
  EMERGENCY_PATIENT,
  EXTRA_M_1,
  EXTRA_M_2,
  EXTRA_M_3,
]; // 11 patienter

export const ALL_ASYNJA_PATIENTS: AsynjaPatientData[] = [
  FRU_ANDERSSON_ASYNJA,
  ASYNJA_ONLY_1,
  ASYNJA_ONLY_2,
  ASYNJA_ONLY_3,
  BOTH_A_1,
  BOTH_A_2,
]; // 6 patienter

// Legacy-export från Del 1
export const FRU_ANDERSSON: TestPatient = {
  personnummer: '19500315-2384',
  fornamn: 'Ingrid',
  efternamn: 'Andersson',
  kon: 'F',
};

export const PATIENTS: TestPatient[] = [FRU_ANDERSSON];

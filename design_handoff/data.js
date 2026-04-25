// Patient data for Nimloth Core demo
window.PATIENTS = [
  {
    id: 'p1',
    pnr: '19500315-2384',
    name: 'Ingrid Andersson',
    firstName: 'Ingrid',
    lastName: 'Andersson',
    age: 74,
    sex: 'Kvinna',
    address: 'Storgatan 14, 411 23 Göteborg',
    phone: '031-12 34 56',
    sources: ['melior-su', 'asynja'],
    servingEdge: 'SU',
    allergies: [
      { drug: 'Penicillin V', reaction: 'Urtikaria', severity: 'Måttlig', source: 'melior-su', verified: 2 }
    ],
    cdsAlerts: [
      {
        indicator: 'critical',
        summary: 'Antikoagulerad patient — kontrollera INR före ingrepp',
        detail: 'Patienten står på Waran 2.5 mg (ATC B01AA03). Senaste INR 2.8 (2025-03-20). Vid akut ingrepp bör aktuellt INR kontrolleras. Målområde 2.0–3.0.',
        source: 'VGR CDS · Waran-profylax',
        suggestions: ['Beställ akut INR', 'Visa INR-trend']
      },
      {
        indicator: 'info',
        summary: 'Höftprotes höger — cemented, Zimmer Avenir Complete',
        detail: 'Inopererad 2025-03-15 på SU Mölndal. Vid misstanke om periprostetisk fraktur, notera implantattyp.',
        source: 'Melior SU · Implantatregister'
      },
      {
        indicator: 'warning',
        summary: 'Tidigare DVT 2025-03-18 — utökad profylax rekommenderad',
        detail: 'Postoperativ DVT efter höftprotes. Förlängd trombosprofylax rekommenderas i minst 35 dagar postoperativt enligt VGR-riktlinje.',
        source: 'VGR CDS · Trombosprofylax'
      }
    ],
    medications: [
      { name: 'Waran', atc: 'B01AA03', strength: '2.5 mg', dose: '1 x 1', route: 'PO', start: '2025-03-18', prescriber: 'Dr. E. Lindqvist', source: 'melior-su', anticoag: true, inr: 2.8, inrDate: '2025-03-20' },
      { name: 'Metformin', atc: 'A10BA02', strength: '500 mg', dose: '1 x 2', route: 'PO', start: '2018-04-12', prescriber: 'Dr. M. Berg', source: 'asynja' },
      { name: 'Simvastatin', atc: 'C10AA01', strength: '20 mg', dose: '1 x 1', route: 'PO', start: '2019-09-01', prescriber: 'Dr. M. Berg', source: 'asynja' },
      { name: 'Paracetamol', atc: 'N02BE01', strength: '500 mg', dose: '1-2 x 3', route: 'PO', start: '2025-03-15', prescriber: 'Dr. E. Lindqvist', source: 'melior-su' },
      { name: 'Omeprazol', atc: 'A02BC01', strength: '20 mg', dose: '1 x 1', route: 'PO', start: '2023-01-10', prescriber: 'Dr. M. Berg', source: 'asynja', dup: true }
    ],
    timeline: [
      { date: '2025-10-15', type: 'encounter', title: 'Årskontroll diabetes', sub: 'Närhälsan VC Centrum · Dr. M. Berg', note: 'HbA1c 52, INR 2.8, Krea 78', source: 'asynja' },
      { date: '2025-05-05', type: 'encounter', title: 'Uppföljning ortopedmottagning', sub: 'SU Mölndal · Dr. E. Lindqvist', note: 'Protes i gott läge. Gångförmåga 200 m. Patienten nöjd.', source: 'melior-su' },
      { date: '2025-03-25', type: 'encounter', title: 'Utskrivning ortopedavdelning', sub: 'SU Mölndal', note: 'Diagnoser: M16.1, Z96.64, I82.4. Läkemedel: Waran 2.5 mg, Paracetamol.', source: 'melior-su' },
      { date: '2025-03-18', type: 'critical', title: 'DVT diagnostiserad', sub: 'SU Mölndal', note: 'Diagnos I82.4. Waran insatt. Ultraljud konfirmerade tromb i v. femoralis.', source: 'melior-su' },
      { date: '2025-03-15', type: 'procedure', title: 'Total höftprotes höger (NFB49)', sub: 'SU Mölndal · Dr. E. Lindqvist', note: 'Cemented, Zimmer Avenir Complete. Duration 95 min. Spinalanestesi.', source: 'melior-su' },
      { date: '2025-03-14', type: 'encounter', title: 'Inskrivning ortopedavdelning', sub: 'SU Mölndal', note: 'Preoperativ bedömning. EKG, blodstatus, INR 1.1.', source: 'melior-su' },
      { date: '2025-02-20', type: 'diagnosis', title: 'Ny diagnos: Primär koxartros höger (M16.1)', sub: 'Närhälsan VC Centrum', note: 'Röntgen visar grad 3 artros. Remiss till ortoped.', source: 'asynja' },
      { date: '2024-11-08', type: 'lab', title: 'Lab-panel', sub: 'FlexLab · Närhälsan', note: 'HbA1c 54, Krea 82, CRP <3, Hb 128.', source: 'flexlab' }
    ],
    procedures: [
      {
        name: 'Total höftprotesplastik höger',
        kva: 'NFB49',
        snomed: '179344006',
        date: '2025-03-15',
        duration: 95,
        surgeon: 'Dr. Erik Lindqvist',
        surgeonId: 'SE123456789',
        anesthesia: 'Spinalanestesi',
        side: 'Höger',
        implant: {
          type: 'Cemented',
          manufacturer: 'Zimmer Biomet',
          model: 'Avenir Complete',
          size: 'Size 3 stem, 52 mm cup'
        },
        complications: 'Postoperativ DVT (I82.4) 2025-03-18',
        source: 'melior-su'
      },
      {
        name: 'Koloskopi',
        kva: 'JFA35',
        snomed: '73761001',
        date: '2022-06-12',
        duration: 35,
        surgeon: 'Dr. A. Nilsson',
        anesthesia: 'Sedering',
        side: null,
        implant: null,
        complications: null,
        note: 'Normalt fynd. Rekommenderad uppföljning om 10 år.',
        source: 'melior-su'
      }
    ],
    labs: [
      { name: 'INR', loinc: '34714-6', value: 2.8, unit: '', refLow: 2.0, refHigh: 3.0, flag: null, date: '2025-03-20', orderer: 'Dr. E. Lindqvist', source: 'flexlab', trend: [1.1, 1.8, 2.4, 2.6, 2.9, 2.8], anticoagTarget: true },
      { name: 'Hemoglobin', loinc: '718-7', value: 112, unit: 'g/L', refLow: 117, refHigh: 153, flag: 'L', date: '2025-03-16', orderer: 'Dr. E. Lindqvist', source: 'flexlab', trend: [128, 124, 118, 112] },
      { name: 'CRP', loinc: '1988-5', value: 48, unit: 'mg/L', refLow: 0, refHigh: 5, flag: 'HH', date: '2025-03-16', orderer: 'Dr. E. Lindqvist', source: 'flexlab', trend: [3, 62, 48] },
      { name: 'Krea', loinc: '2160-0', value: 82, unit: 'µmol/L', refLow: 45, refHigh: 90, flag: null, date: '2025-03-16', orderer: 'Dr. E. Lindqvist', source: 'flexlab', trend: [78, 80, 82] },
      { name: 'HbA1c', loinc: '4548-4', value: 52, unit: 'mmol/mol', refLow: 20, refHigh: 42, flag: 'H', date: '2025-10-15', orderer: 'Dr. M. Berg', source: 'flexlab', trend: [48, 51, 54, 52] },
      { name: 'Trombocyter', loinc: '777-3', value: 312, unit: '10⁹/L', refLow: 145, refHigh: 387, flag: null, date: '2025-03-16', orderer: 'Dr. E. Lindqvist', source: 'flexlab', trend: [290, 305, 312] }
    ]
  },
  {
    id: 'p2',
    pnr: '19780612-1234',
    name: 'Erik Svensson',
    firstName: 'Erik',
    lastName: 'Svensson',
    age: 47,
    sex: 'Man',
    address: 'Björkvägen 8, 531 30 Lidköping',
    phone: '0510-45 67 89',
    sources: ['melior-skas'],
    servingEdge: 'SkaS',
    allergies: [],
    cdsAlerts: [
      {
        indicator: 'warning',
        summary: 'Hypertoni ej välkontrollerad — senaste BT 162/98',
        detail: 'Genomsnitt senaste 3 månaderna: 158/94 mmHg. Målvärde < 140/90. Överväg dosjustering eller tillägg av ACE-hämmare.',
        source: 'VGR CDS · Hypertoni-protokoll'
      },
      {
        indicator: 'info',
        summary: 'Årskontroll förfaller om 14 dagar',
        detail: 'Enligt vårdprogrammet för hypertoni ska patienten kallas för årskontroll 2026-05-05.',
        source: 'Kallelsesystem'
      }
    ],
    medications: [
      { name: 'Enalapril', atc: 'C09AA02', strength: '10 mg', dose: '1 x 1', route: 'PO', start: '2022-03-01', prescriber: 'Dr. K. Olsson', source: 'melior-skas' },
      { name: 'Amlodipin', atc: 'C08CA01', strength: '5 mg', dose: '1 x 1', route: 'PO', start: '2023-11-20', prescriber: 'Dr. K. Olsson', source: 'melior-skas' }
    ],
    timeline: [
      { date: '2026-03-10', type: 'encounter', title: 'Återbesök hypertoni', sub: 'SkaS Lidköping · Dr. K. Olsson', note: 'BT 162/98. Puls 76. Patienten uppger god följsamhet.', source: 'melior-skas' },
      { date: '2025-10-08', type: 'lab', title: 'Blodstatus + lipider', sub: 'FlexLab', note: 'LDL 3.8, Krea 94, K 4.2.', source: 'flexlab' },
      { date: '2025-09-01', type: 'encounter', title: 'Årskontroll hypertoni', sub: 'SkaS Lidköping', note: 'BT 154/92. Rekommenderad intensifierad behandling.', source: 'melior-skas' }
    ],
    procedures: [],
    labs: [
      { name: 'LDL-kolesterol', loinc: '13457-7', value: 3.8, unit: 'mmol/L', refLow: 0, refHigh: 3.0, flag: 'H', date: '2025-10-08', orderer: 'Dr. K. Olsson', source: 'flexlab', trend: [3.2, 3.5, 3.8] },
      { name: 'Krea', loinc: '2160-0', value: 94, unit: 'µmol/L', refLow: 60, refHigh: 105, flag: null, date: '2025-10-08', orderer: 'Dr. K. Olsson', source: 'flexlab', trend: [88, 91, 94] },
      { name: 'Kalium', loinc: '2823-3', value: 4.2, unit: 'mmol/L', refLow: 3.5, refHigh: 5.0, flag: null, date: '2025-10-08', orderer: 'Dr. K. Olsson', source: 'flexlab', trend: [4.1, 4.0, 4.2] }
    ]
  },
  {
    id: 'p3',
    pnr: '20010303-5678',
    name: 'Maria Karlsson',
    firstName: 'Maria',
    lastName: 'Karlsson',
    age: 25,
    sex: 'Kvinna',
    address: 'Linnégatan 3, 413 04 Göteborg',
    phone: '070-123 45 67',
    sources: ['asynja'],
    servingEdge: 'Central',
    allergies: [
      { drug: 'Jordnötter', reaction: 'Anafylaxi', severity: 'Allvarlig', source: 'asynja', verified: 1 }
    ],
    cdsAlerts: [
      {
        indicator: 'critical',
        summary: 'Anafylaxirisk — jordnötter. EpiPen ordinerad.',
        detail: 'Patienten har dokumenterad anafylaktisk reaktion mot jordnötter. EpiPen 0.3 mg förskriven 2024-01-15. Försiktighet vid ordination av läkemedel med arakidolja.',
        source: 'VGR CDS · Allergivarning'
      }
    ],
    medications: [
      { name: 'EpiPen', atc: 'C01CA24', strength: '0.3 mg', dose: 'Vid behov', route: 'IM', start: '2024-01-15', prescriber: 'Dr. A. Holm', source: 'asynja' },
      { name: 'Cetirizin', atc: 'R06AE07', strength: '10 mg', dose: '1 x 1 vb', route: 'PO', start: '2020-05-12', prescriber: 'Dr. A. Holm', source: 'asynja' }
    ],
    timeline: [
      { date: '2026-02-14', type: 'encounter', title: 'Årskontroll allergi', sub: 'Närhälsan Linné · Dr. A. Holm', note: 'Inga nya reaktioner senaste året. EpiPen-förnyad.', source: 'asynja' },
      { date: '2024-01-15', type: 'medication', title: 'EpiPen förskriven', sub: 'Närhälsan Linné', note: 'Efter kontrollerad anafylaxi. Patienten instruerad i användning.', source: 'asynja' }
    ],
    procedures: [],
    labs: [
      { name: 'Tryptase', loinc: '31208-2', value: 8.2, unit: 'µg/L', refLow: 0, refHigh: 11.4, flag: null, date: '2024-01-20', orderer: 'Dr. A. Holm', source: 'flexlab', trend: [7.8, 8.2] }
    ]
  }
];

// Add diagnoses, vitals, encounters to each patient
window.PATIENTS[0].diagnoses = [
  { code: 'M16.1', text: 'Primär koxartros, höger', type: 'PRIMARY', status: 'Aktiv', date: '2025-02-20', by: 'Dr. M. Berg', source: 'asynja', verifiedIn: 2 },
  { code: 'Z96.64', text: 'Höftledsprotes (status)', type: 'SECONDARY', status: 'Aktiv', date: '2025-03-15', by: 'Dr. E. Lindqvist', source: 'melior-su' },
  { code: 'I82.4', text: 'Djup ventrombos i nedre extremitet', type: 'COMPLICATION', status: 'Aktiv', date: '2025-03-18', by: 'Dr. E. Lindqvist', source: 'melior-su', relatedTo: 'M16.1 / NFB49' },
  { code: 'E11.9', text: 'Diabetes mellitus typ 2 utan komplikationer', type: 'SECONDARY', status: 'Aktiv', date: '2018-04-12', by: 'Dr. M. Berg', source: 'asynja' },
  { code: 'E78.0', text: 'Ren hyperkolesterolemi', type: 'SECONDARY', status: 'Aktiv', date: '2019-09-01', by: 'Dr. M. Berg', source: 'asynja' },
  { code: 'K21.9', text: 'Gastroesofageal reflux', type: 'SECONDARY', status: 'Avslutad', date: '2023-01-10', by: 'Dr. M. Berg', source: 'asynja' }
];
window.PATIENTS[0].vitals = {
  latest: [
    { name: 'BT', value: '145/82', unit: 'mmHg', status: 'warning', date: '2025-03-15', source: 'melior-su' },
    { name: 'Puls', value: '78', unit: '/min', status: 'normal', date: '2025-03-15', source: 'melior-su' },
    { name: 'Temp', value: '36.8', unit: '°C', status: 'normal', date: '2025-03-15', source: 'melior-su' },
    { name: 'SpO₂', value: '97', unit: '%', status: 'normal', date: '2025-03-15', source: 'melior-su' },
    { name: 'AF', value: '16', unit: '/min', status: 'normal', date: '2025-03-15', source: 'melior-su' },
    { name: 'Vikt', value: '68.4', unit: 'kg', status: 'normal', date: '2025-03-14', source: 'melior-su' }
  ],
  series: {
    bp_sys: [138, 142, 148, 145, 152, 145, 141, 145],
    bp_dia: [78, 80, 84, 82, 88, 82, 80, 82],
    pulse:  [72, 74, 78, 82, 79, 76, 74, 78],
    temp:   [36.7, 36.8, 37.0, 37.2, 36.9, 36.8, 36.7, 36.8],
    dates:  ['2025-03-14 08:00', '2025-03-14 14:00', '2025-03-14 20:00', '2025-03-15 02:00', '2025-03-15 08:00', '2025-03-15 14:00', '2025-03-15 20:00', '2025-03-16 08:00']
  }
};
window.PATIENTS[0].encounters = [
  { type: 'INPATIENT', unit: 'Ortopedavdelning 136, SU Mölndal', admit: '2025-03-14', discharge: '2025-03-25', physician: 'Dr. E. Lindqvist', dischargeDx: 'M16.1 / I82.4', source: 'melior-su' },
  { type: 'OUTPATIENT', unit: 'Ortopedmottagning, SU Mölndal', admit: '2025-05-05', discharge: '2025-05-05', physician: 'Dr. E. Lindqvist', dischargeDx: 'Z96.64', source: 'melior-su' },
  { type: 'OUTPATIENT', unit: 'Närhälsan VC Centrum', admit: '2025-10-15', discharge: '2025-10-15', physician: 'Dr. M. Berg', dischargeDx: 'E11.9', source: 'asynja' },
  { type: 'DAYCARE', unit: 'Röntgenavdelning, Närhälsan', admit: '2025-02-18', discharge: '2025-02-18', physician: 'Dr. L. Karlsson', dischargeDx: 'M16.1', source: 'asynja' }
];

window.PATIENTS[1].diagnoses = [
  { code: 'I10.9', text: 'Essentiell hypertoni', type: 'PRIMARY', status: 'Aktiv', date: '2022-03-01', by: 'Dr. K. Olsson', source: 'melior-skas' },
  { code: 'E78.0', text: 'Ren hyperkolesterolemi', type: 'SECONDARY', status: 'Aktiv', date: '2023-11-20', by: 'Dr. K. Olsson', source: 'melior-skas' }
];
window.PATIENTS[1].vitals = {
  latest: [
    { name: 'BT', value: '162/98', unit: 'mmHg', status: 'critical', date: '2026-03-10', source: 'melior-skas' },
    { name: 'Puls', value: '76', unit: '/min', status: 'normal', date: '2026-03-10', source: 'melior-skas' },
    { name: 'Vikt', value: '84.2', unit: 'kg', status: 'normal', date: '2026-03-10', source: 'melior-skas' }
  ],
  series: {
    bp_sys: [142, 148, 154, 158, 156, 160, 162],
    bp_dia: [88, 92, 92, 94, 96, 96, 98],
    pulse: [74, 72, 76, 78, 74, 76, 76],
    temp: [],
    dates: ['2025-09-01', '2025-10-08', '2025-11-15', '2025-12-20', '2026-01-18', '2026-02-14', '2026-03-10']
  }
};
window.PATIENTS[1].encounters = [
  { type: 'OUTPATIENT', unit: 'SkaS Lidköping Medicinmottagning', admit: '2026-03-10', discharge: '2026-03-10', physician: 'Dr. K. Olsson', dischargeDx: 'I10.9', source: 'melior-skas' },
  { type: 'OUTPATIENT', unit: 'SkaS Lidköping Medicinmottagning', admit: '2025-09-01', discharge: '2025-09-01', physician: 'Dr. K. Olsson', dischargeDx: 'I10.9', source: 'melior-skas' }
];

window.PATIENTS[2].diagnoses = [
  { code: 'T78.0', text: 'Anafylaktisk reaktion orsakad av födoämnen', type: 'PRIMARY', status: 'Aktiv', date: '2024-01-15', by: 'Dr. A. Holm', source: 'asynja' },
  { code: 'Z88.6', text: 'Allergi mot födoämnen (status)', type: 'SECONDARY', status: 'Aktiv', date: '2020-05-12', by: 'Dr. A. Holm', source: 'asynja' }
];
window.PATIENTS[2].vitals = {
  latest: [
    { name: 'BT', value: '118/72', unit: 'mmHg', status: 'normal', date: '2026-02-14', source: 'asynja' },
    { name: 'Puls', value: '68', unit: '/min', status: 'normal', date: '2026-02-14', source: 'asynja' },
    { name: 'Vikt', value: '62.1', unit: 'kg', status: 'normal', date: '2026-02-14', source: 'asynja' }
  ],
  series: {
    bp_sys: [115, 118, 120, 118],
    bp_dia: [70, 72, 74, 72],
    pulse: [66, 68, 70, 68],
    temp: [],
    dates: ['2022-03-14', '2023-03-20', '2024-01-15', '2026-02-14']
  }
};
window.PATIENTS[2].encounters = [
  { type: 'OUTPATIENT', unit: 'Närhälsan Linné', admit: '2026-02-14', discharge: '2026-02-14', physician: 'Dr. A. Holm', dischargeDx: 'Z88.6', source: 'asynja' },
  { type: 'EMERGENCY', unit: 'SU Akutmottagningen', admit: '2024-01-15', discharge: '2024-01-15', physician: 'Dr. A. Holm', dischargeDx: 'T78.0', source: 'melior-su' }
];

// ========== System / Topology / Quality / Audit data ==========

window.SOURCE_LABELS = {
  'melior-su':   { label: 'Melior SU',   cls: 'badge-src-melior'  },
  'melior-skas': { label: 'Melior SkaS', cls: 'badge-src-melior'  },
  'melior-nu':   { label: 'Melior NU',   cls: 'badge-src-melior'  },
  'asynja':      { label: 'AsynjaVisph', cls: 'badge-src-asynja'  },
  'pascal':      { label: 'Pascal',      cls: 'badge-src-pascal'  },
  'flexlab':     { label: 'FlexLab',     cls: 'badge-src-flexlab' },
  'nll':         { label: 'NLL',         cls: 'badge-src-nll'     },
  'aggregated':  { label: 'Aggregerat',  cls: 'badge-src-agg'     }
};

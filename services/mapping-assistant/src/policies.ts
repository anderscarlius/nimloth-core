// Risk-policy: vad gör mapping-assistant när den upptäcker ett okänt mönster?
//
// Patterns kommer från Observer (Kafka-consumer på core.system.quality.metrics)
// eller direkt från Asker (transform.confidence=low). Patterns klassificeras
// och slås upp i RISK_POLICIES.
//
// Per pattern beslutar policyn:
//   - riskLevel:    informativ för dashboard-prioritering
//   - autoSuggest:  ska AI generera ett förslag automatiskt? (false = kräver explicit propose-anrop)
//   - blockEvents:  ska transform pausa events tills någon godkänner? (true betyder asker-flow)
//   - alertOnCall:  publicera till core.system.alerts för on-call-sökning
//
// Hard rule: PII-relaterade patterns utan patient-koppling defaultar till
// högsta nivå. Annars riskerar vi att en ny tabell med personnummer rinner
// igenom utan PDL-skydd.

export type Pattern =
  | 'new_enum_value'
  | 'new_column'
  | 'new_table'
  | 'new_table_with_pii_no_patient_ref'
  | 'unknown';

export interface RiskPolicy {
  riskLevel: 'low' | 'medium' | 'high';
  autoSuggest: boolean;
  blockEvents: boolean;
  alertOnCall: boolean;
}

export const RISK_POLICIES: Record<Pattern, RiskPolicy> = {
  new_enum_value: {
    riskLevel: 'low',
    autoSuggest: true,
    blockEvents: false,
    alertOnCall: false,
  },
  new_column: {
    riskLevel: 'medium',
    autoSuggest: true,
    blockEvents: true,
    alertOnCall: false,
  },
  new_table: {
    riskLevel: 'medium',
    autoSuggest: true,
    blockEvents: true,
    alertOnCall: false,
  },
  new_table_with_pii_no_patient_ref: {
    riskLevel: 'high',
    autoSuggest: false,
    blockEvents: true,
    alertOnCall: true,
  },
  unknown: {
    // Konservativ default — om vi inte kan klassificera, blockera och be on-call.
    riskLevel: 'high',
    autoSuggest: false,
    blockEvents: true,
    alertOnCall: true,
  },
};

export interface ClassificationInput {
  /** Tabellnamn det rör. */
  sourceTable: string;
  /** Kolumn (om relevant). */
  columnName?: string;
  /** Klassificerings-output från AI (explain-skip-promptens svar). */
  aiPattern?: string;
  /**
   * När observer ser hela tabellnamn som inte tidigare existerat:
   * - hasPatientRef: tabellen har en kolumn som ser ut som patient_id/personnummer/patient_pnr
   * - hasPiiSignal: kolumnnamn matchar pii-heuristik (`namn`, `adress`, `telefon`, ...)
   */
  hasPatientRef?: boolean;
  hasPiiSignal?: boolean;
  /** Är denna tabell helt ny (inga rader tidigare sett)? */
  isNewTable?: boolean;
  /** Är detta en ny kolumn på existerande tabell? */
  isNewColumn?: boolean;
}

const PII_HEURISTICS = [
  /personn?ummer/i,
  /pnr$/i,
  /^namn$/i,
  /fornamn|efternamn|förnamn|efternamn/i,
  /\badress\b/i,
  /telefon/i,
  /epost|email/i,
  /^kon$|\bkön\b/i,
];

const PATIENT_REF_HEURISTICS = [
  /^patient_id$/i,
  /^patient_pnr$/i,
  /^patient$/i,
  /^pnr$/i,
];

/**
 * Klassificera ett pattern utifrån AI-output + kolumn-heuristik. AI-svaret är
 * ledande, men hard-rule:n för pii-utan-patient-ref tas från heuristiken eftersom
 * AI-svaret kan ha missats eller manipulerats.
 */
export function classifyPattern(input: ClassificationInput): Pattern {
  // Hard rule först: ny tabell + pii-signal + ingen patient-ref → high risk
  if (input.isNewTable && input.hasPiiSignal && !input.hasPatientRef) {
    return 'new_table_with_pii_no_patient_ref';
  }
  // AI-output, om tillförlitligt
  switch (input.aiPattern) {
    case 'new_enum_value':
    case 'new_column':
    case 'new_table':
    case 'new_table_with_pii_no_patient_ref':
      return input.aiPattern;
    case 'noise':
      return 'unknown'; // konservativ default — noise-flag används bara för att ignorera, inte autosuggest
    default:
      break;
  }
  // Fallback: heuristik på input
  if (input.isNewTable) return 'new_table';
  if (input.isNewColumn) return 'new_column';
  return 'unknown';
}

/**
 * Heuristisk PII-detektion på kolumnnamn. Used by Observer för att avgöra
 * om en ny tabell triggar `new_table_with_pii_no_patient_ref`.
 */
export function hasPiiColumns(columnNames: string[]): boolean {
  return columnNames.some((c) => PII_HEURISTICS.some((rx) => rx.test(c)));
}

export function hasPatientReference(columnNames: string[]): boolean {
  return columnNames.some((c) => PATIENT_REF_HEURISTICS.some((rx) => rx.test(c)));
}

/** Lookup med default till 'unknown'-policy. */
export function lookupPolicy(pattern: Pattern): RiskPolicy {
  return RISK_POLICIES[pattern];
}

// Template registry — populated in AC3.

import type { TemplateDefinition } from "../types.js";
import { OBSERVATION_TREND_BY_PERIOD } from "./observation-trend-by-period.js";
import { HBA1C_ABOVE_THRESHOLD } from "./hba1c-above-threshold.js";
import { DIABETES_WITHOUT_FOLLOWUP } from "./diabetes-without-followup.js";
import { RESPONDER_AFTER_RX } from "./responder-after-rx.js";
import { NONRESPONDER_AFTER_RX } from "./nonresponder-after-rx.js";
import { ACTIVE_MEDICATIONS } from "./active-medications.js";
import { DOCUMENTED_ALLERGIES } from "./documented-allergies.js";
import { ACTIVE_DIAGNOSES } from "./active-diagnoses.js";

export const ALL_TEMPLATES: TemplateDefinition[] = [
  OBSERVATION_TREND_BY_PERIOD,
  HBA1C_ABOVE_THRESHOLD,
  DIABETES_WITHOUT_FOLLOWUP,
  RESPONDER_AFTER_RX,
  NONRESPONDER_AFTER_RX,
  // Fas 3 AC5 — data-query-mallar för medicineringsgenomgångens orkestrator.
  ACTIVE_MEDICATIONS,
  DOCUMENTED_ALLERGIES,
  ACTIVE_DIAGNOSES,
];

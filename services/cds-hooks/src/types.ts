// CDS Hooks 2.0 + hjälptyper.

import type { FhirPatient, FhirBundle } from '@nimloth-core/shared/types';

export interface HookContext {
  userId?: string;
  patientId?: string;
  encounterId?: string;
}

export interface HookRequest {
  hookInstance: string;
  hook: string;
  context: HookContext;
  prefetch?: Record<string, unknown>;
}

export type CardIndicator = 'info' | 'warning' | 'critical';

export interface CardSource {
  label: string;
  url?: string;
  icon?: string;
}

export interface CardAction {
  type: 'create' | 'update' | 'delete';
  description: string;
  resource?: Record<string, unknown>;
}

export interface CardSuggestion {
  label: string;
  uuid: string;
  actions?: CardAction[];
}

export interface Card {
  uuid: string;
  summary: string;
  detail?: string;
  indicator: CardIndicator;
  source: CardSource;
  suggestions?: CardSuggestion[];
  links?: Array<{ label: string; url: string; type: 'absolute' | 'smart' }>;
}

export interface CardsResponse {
  cards: Card[];
}

export interface Prefetch {
  patient?: FhirPatient;
  medications?: FhirBundle;
  procedures?: FhirBundle;
  conditions?: FhirBundle;
  allergies?: FhirBundle;
}

/** Indicator-rank för sortering (critical > warning > info). */
export const INDICATOR_ORDER: Record<CardIndicator, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => INDICATOR_ORDER[a.indicator] - INDICATOR_ORDER[b.indicator]);
}

/** Extraherar id från FHIR-referens "ResourceType/id" eller rå id. */
export function extractId(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  const slash = ref.indexOf('/');
  return slash >= 0 ? ref.slice(slash + 1) : ref;
}

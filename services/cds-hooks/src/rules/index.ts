import type { Card, Prefetch } from '../types.js';
import { anticoagulationCard } from './anticoagulation.js';
import { implantCards } from './implant-alert.js';
import { dvtCard } from './dvt-risk.js';

export { anticoagulationCard, implantCards, dvtCard };

/** Kör alla regler och returnerar en flat lista med cards. */
export function runAllRules(prefetch: Prefetch): Card[] {
  const cards: Card[] = [];
  const anticoag = anticoagulationCard(prefetch);
  if (anticoag) cards.push(anticoag);
  cards.push(...implantCards(prefetch));
  const dvt = dvtCard(prefetch);
  if (dvt) cards.push(dvt);
  return cards;
}

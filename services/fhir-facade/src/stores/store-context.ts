// Hjälpare som plockar StoreContext ur Express.Request. PDL-middleware och
// auth-middleware har redan satt req.pdl + req.user, så vi mappar bara här.
//
// Ordningen i middleware-stacken är: auth → pdl → audit → resource-routes.
// Det betyder att req.pdl/req.user alltid är populerade när handlern kör.

import type { Request } from 'express';
import type { StoreContext } from './types.js';

export function storeContextFromRequest(req: Request): StoreContext {
  return {
    userHsa: req.user?.hsa_id,
    careUnit: req.pdl?.care_unit,
    purpose: req.pdl?.purpose,
  };
}

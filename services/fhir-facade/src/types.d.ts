// Ambient module augmentation för Express.Request.
// Använder globalt Express-namespace för att undvika module-import-problem.

declare global {
  namespace Express {
    interface Request {
      user?: import('./middleware/auth.js').AuthUser;
      pdl?: import('./middleware/pdl.js').PdlContext;
      /** Vilken canonical store som faktiskt svarade på request (Sprint 2 P3.3).
       *  Sätts av store-routade route-handlers, läses av audit-middleware. */
      canonicalStore?: import('./stores/types.js').CanonicalStore;
    }
  }
}

export {};

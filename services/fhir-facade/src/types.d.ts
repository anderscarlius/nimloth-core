// Ambient module augmentation för Express.Request.
// Använder globalt Express-namespace för att undvika module-import-problem.

declare global {
  namespace Express {
    interface Request {
      user?: import('./middleware/auth.js').AuthUser;
      pdl?: import('./middleware/pdl.js').PdlContext;
    }
  }
}

export {};

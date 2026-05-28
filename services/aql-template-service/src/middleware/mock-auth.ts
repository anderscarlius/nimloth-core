import type { Request, Response, NextFunction } from "express";

// MVP-skuld: mock Bearer-auth. Passerar igenom alla anrop oavsett header-
// innehåll. Loggar bara om Authorization saknas så Studio/agent-anropare
// vänjer sig vid att skicka den när vi senare aktiverar riktig auth.
//
// Real auth (HSA-ID via JWT/PASETO + ABAC-attribut) implementeras post-MVP
// — denna middleware byts ut helt då.
export function mockAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  if (!header) {
    (req as Request & { _missingAuth?: boolean })._missingAuth = true;
  }
  next();
}

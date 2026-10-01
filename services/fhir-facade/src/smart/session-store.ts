// In-memory SMART launch/token state — dev-stub only, single-process.

import { randomBytes } from 'node:crypto';

export interface SmartLaunchContext {
  launchId: string;
  patient: string;
  /** FHIR reference, t.ex. Practitioner/SE-DEMO-PHYSICIAN */
  practitioner: string;
  createdAt: number;
}

export interface SmartAuthCode {
  code: string;
  launchId: string;
  clientId: string;
  redirectUri: string;
  expiresAt: number;
}

export interface SmartAccessTokenRecord {
  token: string;
  patient: string;
  fhirUser: string;
  scope: string;
  expiresAt: number;
}

const TTL_MS = 15 * 60 * 1000;

function id(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

export class SmartSessionStore {
  private readonly launches = new Map<string, SmartLaunchContext>();
  private readonly codes = new Map<string, SmartAuthCode>();
  private readonly tokens = new Map<string, SmartAccessTokenRecord>();

  createLaunch(patient: string, practitioner: string): SmartLaunchContext {
    const launchId = id('launch');
    const ctx: SmartLaunchContext = {
      launchId,
      patient,
      practitioner,
      createdAt: Date.now(),
    };
    this.launches.set(launchId, ctx);
    return ctx;
  }

  getLaunch(launchId: string): SmartLaunchContext | null {
    const ctx = this.launches.get(launchId);
    if (!ctx) return null;
    if (Date.now() - ctx.createdAt > TTL_MS) {
      this.launches.delete(launchId);
      return null;
    }
    return ctx;
  }

  issueAuthCode(launchId: string, clientId: string, redirectUri: string): SmartAuthCode | null {
    const launch = this.getLaunch(launchId);
    if (!launch) return null;
    const code = id('code');
    const record: SmartAuthCode = {
      code,
      launchId,
      clientId,
      redirectUri,
      expiresAt: Date.now() + TTL_MS,
    };
    this.codes.set(code, record);
    return record;
  }

  exchangeCode(code: string, clientId: string, redirectUri: string): SmartAccessTokenRecord | null {
    const auth = this.codes.get(code);
    if (!auth) return null;
    this.codes.delete(code);
    if (Date.now() > auth.expiresAt) return null;
    if (auth.clientId !== clientId || auth.redirectUri !== redirectUri) return null;
    const launch = this.getLaunch(auth.launchId);
    if (!launch) return null;

    const token = id('access');
    const record: SmartAccessTokenRecord = {
      token,
      patient: launch.patient,
      fhirUser: launch.practitioner,
      scope: 'launch patient/*.read user/*.read openid fhirUser',
      expiresAt: Date.now() + TTL_MS,
    };
    this.tokens.set(token, record);
    return record;
  }

  getToken(bearer: string): SmartAccessTokenRecord | null {
    const record = this.tokens.get(bearer);
    if (!record) return null;
    if (Date.now() > record.expiresAt) {
      this.tokens.delete(bearer);
      return null;
    }
    return record;
  }
}

/** Delad instans per process (dev-stub). */
export const smartSessionStore = new SmartSessionStore();

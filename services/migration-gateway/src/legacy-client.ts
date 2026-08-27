// Tunn HTTP-klient mot nimloth-legacy-sim. Ingen logik utöver
// serialisering — legacy-sim är auktoritativ i S0/S1, gatewayen ska inte
// tolka eller normalisera dess svar mer än nödvändigt för att veta att
// skrivningen lyckades.

export interface LegacyNote {
  id: string;
  patient_no: string;
  care_unit: string;
  text: string;
  author_sign: string;
  created_at: string;
  signed_at: string | null;
}

export class LegacyWriteError extends Error {
  constructor(public readonly status: number, public readonly body: unknown) {
    super(`legacy-sim avvisade skrivningen: HTTP ${status}`);
    this.name = "LegacyWriteError";
  }
}

export interface LegacyClient {
  createNote(input: {
    patient_no: string;
    care_unit: string;
    text: string;
    author_sign: string;
  }): Promise<LegacyNote>;
  getNotesByPatient(patientNo: string): Promise<LegacyNote[]>;
  getNoteById(id: string): Promise<LegacyNote | undefined>;
}

// G1 (Spec B4 kapitel 11): live läsfederation, inte logg-baserad CDC.
// Gatewayens läsväg frågar legacy-simulatorns REST-API direkt vid
// lästillfället — ingen materialiserad kopia i Nimloth. Enklaste ärliga
// mekanism för en lokal, tidsboxad etapp; se spec:ens kapitel 8 för
// motiveringen mot alternativen.
export function createLegacyClient(baseUrl: string): LegacyClient {
  return {
    async createNote(input) {
      const resp = await fetch(`${baseUrl}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await resp.json();
      if (resp.status !== 201) {
        throw new LegacyWriteError(resp.status, body);
      }
      return body as LegacyNote;
    },

    async getNotesByPatient(patientNo) {
      const resp = await fetch(`${baseUrl}/notes/by-patient/${encodeURIComponent(patientNo)}`);
      return (await resp.json()) as LegacyNote[];
    },

    async getNoteById(id) {
      const resp = await fetch(`${baseUrl}/notes/${encodeURIComponent(id)}`);
      if (resp.status === 404) return undefined;
      return (await resp.json()) as LegacyNote;
    },
  };
}

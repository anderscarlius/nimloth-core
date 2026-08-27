import { randomUUID } from "node:crypto";
import type { LegacyClient, LegacyNote } from "../legacy-client.js";
import type { OpenEhrClient } from "../openehr-client.js";
import { createGatewayAuditPublisher, type GatewayAuditPublisher } from "../audit.js";
import pino from "pino";

export function fakeAudit(): GatewayAuditPublisher {
  return createGatewayAuditPublisher(
    { brokers: [], clientId: "test", topic: "core.audit.access" },
    pino({ level: "silent" }),
  );
}

export function fakeLegacyClient(): LegacyClient {
  const notes = new Map<string, LegacyNote>();
  return {
    async createNote(input) {
      const note: LegacyNote = {
        id: randomUUID(),
        patient_no: input.patient_no,
        care_unit: input.care_unit,
        text: input.text,
        author_sign: input.author_sign,
        created_at: "2026-08-19 10:00:00",
        signed_at: null,
      };
      notes.set(note.id, note);
      return note;
    },
    async getNotesByPatient(patientNo) {
      return [...notes.values()].filter((n) => n.patient_no === patientNo);
    },
    async getNoteById(id) {
      return notes.get(id);
    },
  };
}

export function fakeFailingLegacyClient(): LegacyClient {
  return {
    async createNote() {
      const { LegacyWriteError } = await import("../legacy-client.js");
      throw new LegacyWriteError(500, { fel: "simulerat-fel" });
    },
    async getNotesByPatient() {
      return [];
    },
    async getNoteById() {
      return undefined;
    },
  };
}

export function fakeOpenEhrClient(
  opts: { shouldFail?: boolean; rawComposition?: unknown } = {},
): OpenEhrClient & { calls: number } {
  const client = {
    calls: 0,
    async writeProgressNote() {
      client.calls++;
      if (opts.shouldFail) {
        throw new Error("simulerat EHRbase-fel");
      }
      return { compositionUid: `${randomUUID()}::local.ehrbase.org::1` };
    },
    async fetchRawComposition() {
      return opts.rawComposition ?? { _type: "COMPOSITION", composer: { name: "Test Testsson" } };
    },
  };
  return client;
}

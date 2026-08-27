// Tunn HTTP-klient mot lokal EHRbase — skriver en progress_note.v1-
// composition (interims-OPT:en, D7) rotad på encounter.v1. Formen är
// verifierad end-to-end i services/openehr-composer/src/bridge/__tests__/
// progress-note-opt.test.ts (AC-P12, byteskontraktet).

export class OpenEhrWriteError extends Error {
  constructor(public readonly status: number, public readonly body: unknown) {
    super(`EHRbase avvisade skuggskrivningen: HTTP ${status}`);
    this.name = "OpenEhrWriteError";
  }
}

export interface OpenEhrClient {
  writeProgressNote(input: {
    ehrId: string;
    text: string;
    composerName: string;
    timestampIso: string;
  }): Promise<{ compositionUid: string }>;
}

export function createOpenEhrClient(baseUrl: string): OpenEhrClient {
  return {
    async writeProgressNote({ ehrId, text, composerName, timestampIso }) {
      const composition = {
        _type: "COMPOSITION",
        name: { value: "Encounter" },
        archetype_node_id: "openEHR-EHR-COMPOSITION.encounter.v1",
        archetype_details: {
          archetype_id: { value: "openEHR-EHR-COMPOSITION.encounter.v1" },
          template_id: { value: "progress_note.v1" },
          rm_version: "1.0.4",
        },
        language: { terminology_id: { value: "ISO_639-1" }, code_string: "sv" },
        territory: { terminology_id: { value: "ISO_3166-1" }, code_string: "SE" },
        category: {
          value: "event",
          defining_code: { terminology_id: { value: "openehr" }, code_string: "433" },
        },
        composer: { _type: "PARTY_IDENTIFIED", name: composerName },
        context: {
          start_time: { value: timestampIso },
          setting: {
            value: "other care",
            defining_code: { terminology_id: { value: "openehr" }, code_string: "238" },
          },
        },
        content: [
          {
            _type: "OBSERVATION",
            name: { value: "Progress note" },
            archetype_node_id: "openEHR-EHR-OBSERVATION.progress_note.v1",
            archetype_details: {
              archetype_id: { value: "openEHR-EHR-OBSERVATION.progress_note.v1" },
              rm_version: "1.0.4",
            },
            language: { terminology_id: { value: "ISO_639-1" }, code_string: "sv" },
            encoding: { terminology_id: { value: "IANA_character-sets" }, code_string: "UTF-8" },
            subject: { _type: "PARTY_SELF" },
            data: {
              _type: "HISTORY",
              archetype_node_id: "at0001",
              name: { value: "Event Series" },
              origin: { value: timestampIso },
              events: [
                {
                  _type: "POINT_EVENT",
                  archetype_node_id: "at0002",
                  name: { value: "Any event" },
                  time: { value: timestampIso },
                  data: {
                    _type: "ITEM_TREE",
                    archetype_node_id: "at0003",
                    name: { value: "Tree" },
                    items: [
                      {
                        _type: "ELEMENT",
                        archetype_node_id: "at0004",
                        name: { value: "Progress Note" },
                        value: { _type: "DV_TEXT", value: text },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      };

      const resp = await fetch(`${baseUrl}/rest/openehr/v1/ehr/${ehrId}/composition`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(composition),
      });
      const body = await resp.json();
      if (resp.status !== 201) {
        throw new OpenEhrWriteError(resp.status, body);
      }
      return { compositionUid: (body as { uid: { value: string } }).uid.value };
    },
  };
}

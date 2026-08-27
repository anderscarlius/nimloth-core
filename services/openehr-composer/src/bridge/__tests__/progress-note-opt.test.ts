import { describe, expect, it } from "vitest";
import { create } from "xmlbuilder2";
import {
  buildProgressNoteOpt,
  PROGRESS_NOTE_DEFAULT_TEMPLATE_ID,
  PROGRESS_NOTE_ELEMENTS,
} from "../progress-note-opt.js";

const EHRBASE_URL = process.env.EHRBASE_URL;
const integrationGuard = EHRBASE_URL ? it : it.skip;

describe("progress-note-opt (unit)", () => {
  it("AC-P1 — output is parseable XML", () => {
    const xml = buildProgressNoteOpt();
    expect(() => create(xml)).not.toThrow();
    expect(xml.length).toBeGreaterThan(1000);
  });

  it("AC-P2 — root <template> has openEHR namespace", () => {
    const xml = buildProgressNoteOpt();
    const obj = create(xml).end({ format: "object" }) as Record<string, unknown>;
    expect(obj.template).toBeDefined();
    const tpl = obj.template as Record<string, unknown>;
    expect(tpl["@xmlns"]).toBe("http://schemas.openehr.org/v1");
  });

  it("AC-P3 — template_id is 'progress_note.v1'", () => {
    const xml = buildProgressNoteOpt();
    expect(xml).toMatch(/<value>progress_note\.v1<\/value>/);
  });

  it("AC-P4 — OBSERVATION archetype is progress_note.v1, COMPOSITION is encounter.v1", () => {
    const xml = buildProgressNoteOpt();
    expect(xml).toContain("openEHR-EHR-OBSERVATION.progress_note.v1");
    expect(xml).toContain("openEHR-EHR-COMPOSITION.encounter.v1");
  });

  it("AC-P5 — exactly one element, at0004, required", () => {
    expect(PROGRESS_NOTE_ELEMENTS.map((e) => e.nodeId)).toEqual(["at0004"]);
    expect(PROGRESS_NOTE_ELEMENTS[0].required).toBe(true);
  });

  it("AC-P6 — HISTORY/EVENT scaffolding present (OBSERVATION-shape, matches the real ADL: HISTORY->EVENT->ITEM_TREE)", () => {
    const xml = buildProgressNoteOpt();
    expect(xml).toContain("HISTORY");
    expect(xml).toContain("EVENT");
    expect(xml).toContain("rm_type_name>OBSERVATION");
  });

  it("AC-P7 — concept is marked INTERIM (S11 — spårbarhet)", () => {
    const xml = buildProgressNoteOpt();
    expect(xml).toMatch(/INTERIM/);
  });

  it("AC-P8 — overridden templateId/concept/uid flow into the XML", () => {
    const xml = buildProgressNoteOpt({
      templateId: "progress_note.v99",
      concept: "Custom concept",
      uid: "00000000-0000-4000-8000-0000000000cd",
    });
    expect(xml).toContain("progress_note.v99");
    expect(xml).toContain("Custom concept");
    expect(xml).toContain("00000000-0000-4000-8000-0000000000cd");
  });

  it("AC-P9 — output is deterministic across calls (byte-stable for diff)", () => {
    const a = buildProgressNoteOpt();
    const b = buildProgressNoteOpt();
    expect(a).toBe(b);
  });
});

describe("progress-note-opt (integration — EHRBASE_URL required)", () => {
  integrationGuard(
    "AC-P10 — OPT POSTs to EHRbase with 201 or 409",
    { timeout: 15_000 },
    async () => {
      const xml = buildProgressNoteOpt();
      const resp = await fetch(
        `${EHRBASE_URL}/ehrbase/rest/openehr/v1/definition/template/adl1.4`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/xml",
            Accept: "application/xml",
            Prefer: "return=minimal",
          },
          body: xml,
        },
      );
      expect([201, 409]).toContain(resp.status);
    },
  );

  integrationGuard(
    "AC-P11 — GET /definition/template/adl1.4 lists progress_note.v1",
    { timeout: 10_000 },
    async () => {
      const resp = await fetch(
        `${EHRBASE_URL}/ehrbase/rest/openehr/v1/definition/template/adl1.4`,
        { headers: { Accept: "application/json" } },
      );
      expect(resp.status).toBe(200);
      const body = (await resp.json()) as Array<{ template_id: string }>;
      const ids = body.map((t) => t.template_id);
      expect(ids).toContain(PROGRESS_NOTE_DEFAULT_TEMPLATE_ID);
    },
  );

  // === BYTESKONTRAKT (D7/S11) ===============================================
  // Detta test ska köras OFÖRÄNDRAT den dag designer-exporten ersätter denna
  // interims-fil. Det testar bara AQL-kontraktet — inte bridge-builderns
  // interna implementation — så det avslöjar om designer-exporten avviker
  // strukturellt (fel arketyp-path, fel värdetyp) från vad B4:s gateway
  // faktiskt skrivit mot under Etapp 1. Fäller detta test efter bytet:
  // designer-exporten är inte bakåtkompatibel, stanna och utred innan
  // fler compositions skrivs mot den nya mallen.
  integrationGuard(
    "AC-P12 (BYTESKONTRAKT) — en committad composition är AQL-läsbar på progress_note-textens path",
    { timeout: 15_000 },
    async () => {
      const templateXml = buildProgressNoteOpt();
      await fetch(`${EHRBASE_URL}/ehrbase/rest/openehr/v1/definition/template/adl1.4`, {
        method: "POST",
        headers: {
          "Content-Type": "application/xml",
          Accept: "application/xml",
          Prefer: "return=minimal",
        },
        body: templateXml,
      });

      // Skapa ett engångs-EHR för kontraktstestet — inte en syntetisk demopatient.
      const ehrResp = await fetch(`${EHRBASE_URL}/ehrbase/rest/openehr/v1/ehr`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({
          _type: "EHR_STATUS",
          archetype_node_id: "openEHR-EHR-EHR_STATUS.generic.v1",
          name: { value: "EHR Status" },
          subject: {
            external_ref: {
              id: { _type: "GENERIC_ID", value: `progress-note-contract-${Date.now()}`, scheme: "id_scheme" },
              namespace: "test",
              type: "PERSON",
            },
          },
          is_queryable: true,
          is_modifiable: true,
        }),
      });
      const ehr = (await ehrResp.json()) as { ehr_id: { value: string } };
      const ehrId = ehr.ehr_id.value;

      const composition = {
        _type: "COMPOSITION",
        name: { value: "Encounter" },
        archetype_node_id: "openEHR-EHR-COMPOSITION.encounter.v1",
        archetype_details: {
          archetype_id: { value: "openEHR-EHR-COMPOSITION.encounter.v1" },
          template_id: { value: PROGRESS_NOTE_DEFAULT_TEMPLATE_ID },
          rm_version: "1.0.4",
        },
        language: { terminology_id: { value: "ISO_639-1" }, code_string: "sv" },
        territory: { terminology_id: { value: "ISO_3166-1" }, code_string: "SE" },
        category: {
          value: "event",
          defining_code: { terminology_id: { value: "openehr" }, code_string: "433" },
        },
        composer: { _type: "PARTY_IDENTIFIED", name: "B4 byteskontrakt-test" },
        context: {
          start_time: { value: new Date().toISOString() },
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
              origin: { value: new Date().toISOString() },
              events: [
                {
                  _type: "POINT_EVENT",
                  archetype_node_id: "at0002",
                  name: { value: "Any event" },
                  time: { value: new Date().toISOString() },
                  data: {
                    _type: "ITEM_TREE",
                    archetype_node_id: "at0003",
                    name: { value: "Tree" },
                    items: [
                      {
                        _type: "ELEMENT",
                        archetype_node_id: "at0004",
                        name: { value: "Progress Note" },
                        value: { _type: "DV_TEXT", value: "Byteskontrakt-test — inte klinisk data." },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      };

      const compResp = await fetch(
        `${EHRBASE_URL}/ehrbase/rest/openehr/v1/ehr/${ehrId}/composition`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(composition),
        },
      );
      expect(compResp.status).toBe(201);

      const aql = {
        q: `SELECT o/data[at0001]/events[at0002]/data[at0003]/items[at0004]/value/value AS note_text FROM EHR e[ehr_id/value='${ehrId}'] CONTAINS COMPOSITION c CONTAINS OBSERVATION o[openEHR-EHR-OBSERVATION.progress_note.v1]`,
      };
      const aqlResp = await fetch(`${EHRBASE_URL}/ehrbase/rest/openehr/v1/query/aql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aql),
      });
      expect(aqlResp.status).toBe(200);
      const result = (await aqlResp.json()) as { rows: string[][] };
      expect(result.rows.length).toBe(1);
      expect(result.rows[0][0]).toBe("Byteskontrakt-test — inte klinisk data.");
    },
  );
});

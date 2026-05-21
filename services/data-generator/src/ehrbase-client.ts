import { OPENEHR_REST } from "./config.js";

export class EhrbaseError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string,
  ) {
    super(message);
  }
}

export interface EhrbaseFetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  accept?: string;
}

export async function ehrbaseFetch<T = unknown>(
  path: string,
  opts: EhrbaseFetchOptions = {},
): Promise<{ status: number; body: T; raw: string }> {
  const url = new URL(`${OPENEHR_REST}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    url.searchParams.set(k, v);
  }

  const headers: Record<string, string> = {
    Accept: opts.accept ?? "application/json",
    ...opts.headers,
  };
  if (opts.body !== undefined) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body:
      opts.body === undefined
        ? undefined
        : typeof opts.body === "string"
          ? opts.body
          : JSON.stringify(opts.body),
  });

  const raw = await res.text();
  let parsed: T;
  try {
    parsed = raw.length > 0 ? (JSON.parse(raw) as T) : (undefined as T);
  } catch {
    parsed = raw as unknown as T;
  }

  if (!res.ok) {
    throw new EhrbaseError(
      `EHRbase ${opts.method ?? "GET"} ${path} → ${res.status}`,
      res.status,
      raw,
    );
  }

  return { status: res.status, body: parsed, raw };
}

export interface TemplateListEntry {
  template_id: string;
  concept: string;
  archetype_id: string;
  created_timestamp: string;
}

export async function listTemplates(): Promise<TemplateListEntry[]> {
  const { body } = await ehrbaseFetch<TemplateListEntry[]>(
    "/definition/template/adl1.4",
  );
  return body ?? [];
}

export async function getWebTemplate(templateId: string): Promise<unknown> {
  const { body } = await ehrbaseFetch(
    `/definition/template/adl1.4/${templateId}`,
    { accept: "application/openehr.wt+json" },
  );
  return body;
}

export async function uploadOpt(optXml: string): Promise<string> {
  const { raw, status } = await ehrbaseFetch<string>(
    "/definition/template/adl1.4",
    {
      method: "POST",
      body: optXml,
      headers: { "Content-Type": "application/xml" },
      accept: "text/plain",
    },
  );
  if (status !== 201 && status !== 200) {
    throw new EhrbaseError(`Unexpected status ${status}`, status, raw);
  }
  return raw;
}

export async function createEhr(subjectId: string): Promise<string> {
  const payload = {
    _type: "EHR_STATUS",
    archetype_node_id: "openEHR-EHR-EHR_STATUS.generic.v1",
    name: { value: "EHR Status" },
    subject: {
      external_ref: {
        id: { _type: "GENERIC_ID", value: subjectId, scheme: "NIMLOTH" },
        namespace: "NIMLOTH",
        type: "PERSON",
      },
    },
    is_modifiable: true,
    is_queryable: true,
  };
  const { body } = await ehrbaseFetch<{ ehr_id?: { value: string } }>("/ehr", {
    method: "POST",
    body: payload,
    headers: { Prefer: "return=representation" },
  });
  const ehrId = body?.ehr_id?.value;
  if (!ehrId) {
    throw new Error(
      `EHR creation succeeded but no ehr_id in response: ${JSON.stringify(body)}`,
    );
  }
  return ehrId;
}

export async function postCompositionFlat(
  ehrId: string,
  templateId: string,
  flatJson: Record<string, unknown>,
): Promise<string> {
  const { body, raw } = await ehrbaseFetch<{ uid?: { value: string } }>(
    `/ehr/${ehrId}/composition`,
    {
      method: "POST",
      query: { format: "FLAT", templateId },
      body: flatJson,
      headers: { Prefer: "return=representation" },
    },
  );
  const uid = body?.uid?.value;
  if (!uid) {
    throw new Error(`Composition POST succeeded but no uid: ${raw.slice(0, 200)}`);
  }
  return uid;
}

export async function runAql<T = unknown>(
  aql: string,
): Promise<{ columns: { name: string; path: string }[]; rows: T[] }> {
  const { body } = await ehrbaseFetch<{
    columns: { name: string; path: string }[];
    rows: T[];
  }>("/query/aql", {
    method: "POST",
    body: { q: aql },
  });
  return body;
}

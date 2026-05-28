import type { ParameterSpec } from "./types.js";

export class ParameterBindError extends Error {
  constructor(message: string, public readonly field: string) {
    super(message);
  }
}

/** Validate caller params against spec, apply defaults, return canonical map. */
export function validateAndApplyDefaults(
  specs: ParameterSpec[],
  callerParams: Record<string, unknown> = {},
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const spec of specs) {
    const raw = callerParams[spec.name];
    if (raw === undefined || raw === null || raw === "") {
      if (spec.required) {
        throw new ParameterBindError(
          `Required parameter '${spec.name}' missing`,
          spec.name,
        );
      }
      if (spec.default !== undefined) out[spec.name] = spec.default;
      continue;
    }
    out[spec.name] = coerce(spec, raw);
  }
  // Surface unknown params — strict mode so caller catches typos early.
  for (const k of Object.keys(callerParams)) {
    if (!specs.some((s) => s.name === k)) {
      throw new ParameterBindError(
        `Unknown parameter '${k}'`,
        k,
      );
    }
  }
  return out;
}

function coerce(spec: ParameterSpec, raw: unknown): string | number {
  if (spec.type === "number") {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      throw new ParameterBindError(
        `Parameter '${spec.name}' must be a number, got ${JSON.stringify(raw)}`,
        spec.name,
      );
    }
    return n;
  }
  if (spec.type === "date") {
    const s = String(raw);
    if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(s)) {
      throw new ParameterBindError(
        `Parameter '${spec.name}' must be ISO date (YYYY-MM-DD or full ISO 8601), got ${JSON.stringify(raw)}`,
        spec.name,
      );
    }
    return s;
  }
  return String(raw);
}

/** Substitute :param placeholders in an AQL string with sanitized values.
 *  Numbers inlined; strings single-quoted (with embedded ' escaped to ''). */
export function bindParams(
  aql: string,
  params: Record<string, string | number>,
): string {
  return aql.replace(/:([a-z_][a-z_0-9]*)/g, (m, name) => {
    if (!(name in params)) return m;
    const v = params[name];
    return typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
  });
}

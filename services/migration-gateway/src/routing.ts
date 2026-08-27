// Routinghistoriken (Spec B4 §3, B4 Etapp 2 Grind 1 punkt d). Append-only
// — varje ändring är en ny rad, aldrig en UPDATE. "Nuvarande läge" är
// helt enkelt historikens senaste rad för (domain, care_unit); det finns
// medvetet ingen separat cache-tabell att hålla synkad.
//
// Detta ger auktoritetsproveniens över TID gratis: getDirection() tar ett
// valfritt atTime och kan därmed svara på "vad gällde den 14:e?", inte
// bara "vad gäller nu". Ingen cache i gatewayen — varje beslut frågar
// tabellen direkt, så hot-reload är gratis.

import type pg from "pg";
import type { GatewayAuditPublisher } from "./audit.js";

export type RoutingDirection = "LEGACY_ONLY" | "SHADOW" | "NIMLOTH";

export interface RoutingRow {
  domain: string;
  careUnit: string;
  direction: RoutingDirection;
  updatedAt: string;
  updatedBy: string;
}

// S0-utgångsläget: ingen rad i historiken = LEGACY_ONLY. Konservativ
// default — en enhet som aldrig fått en routingändring ska aldrig av
// misstag hamna i SHADOW eller NIMLOTH.
export const DEFAULT_DIRECTION: RoutingDirection = "LEGACY_ONLY";

export async function getDirection(
  pool: pg.Pool,
  domain: string,
  careUnit: string,
  atTime?: Date,
): Promise<RoutingDirection> {
  const result = await pool.query(
    `SELECT direction FROM routing_history
     WHERE domain = $1 AND care_unit = $2 AND changed_at <= COALESCE($3, NOW())
     ORDER BY changed_at DESC
     LIMIT 1`,
    [domain, careUnit, atTime ?? null],
  );
  if (result.rows.length === 0) return DEFAULT_DIRECTION;
  return result.rows[0].direction as RoutingDirection;
}

export async function setDirection(
  pool: pg.Pool,
  audit: GatewayAuditPublisher,
  params: { domain: string; careUnit: string; direction: RoutingDirection; updatedBy: string },
): Promise<RoutingRow> {
  const previous = await getDirection(pool, params.domain, params.careUnit);

  const result = await pool.query(
    `INSERT INTO routing_history (domain, care_unit, direction, changed_by)
     VALUES ($1, $2, $3, $4)
     RETURNING domain, care_unit, direction, changed_at, changed_by`,
    [params.domain, params.careUnit, params.direction, params.updatedBy],
  );
  const row = result.rows[0];

  // Auditeras EFTER lyckad skrivning (S5/I3) — samma avvägning som
  // fhir-facades escalateAuditError-mönster: ett audit-fel ska synas
  // högt, men routingändringen som redan skedde raderas inte för det.
  await audit.emit("ROUTING_CHANGED", {
    resourceType: "RoutingConfig",
    resourceId: `${params.domain}/${params.careUnit}`,
    actorHsaId: params.updatedBy,
    outcome: "SUCCESS",
    details: { from: previous, to: params.direction },
  });

  return {
    domain: row.domain,
    careUnit: row.care_unit,
    direction: row.direction,
    updatedAt: row.changed_at,
    updatedBy: row.changed_by,
  };
}

export async function listRouting(pool: pg.Pool): Promise<RoutingRow[]> {
  const result = await pool.query(
    `SELECT DISTINCT ON (domain, care_unit)
            domain, care_unit, direction, changed_at, changed_by
     FROM routing_history
     ORDER BY domain, care_unit, changed_at DESC`,
  );
  return result.rows.map((row) => ({
    domain: row.domain,
    careUnit: row.care_unit,
    direction: row.direction,
    updatedAt: row.changed_at,
    updatedBy: row.changed_by,
  }));
}

// Routingtabellen (Spec B4 §3). Varje beslut läser tabellen direkt — ingen
// cache. Varje ändring auditeras (S5/I3) i samma transaktion som skrivningen,
// så det inte kan finnas en routingändring utan auditpost.

import type pg from "pg";
import type { GatewayAuditPublisher } from "./audit.js";

export type RoutingDirection = "LEGACY_ONLY" | "SHADOW";

export interface RoutingRow {
  domain: string;
  careUnit: string;
  direction: RoutingDirection;
  updatedAt: string;
  updatedBy: string;
}

// S0-utgångsläget: ingen rad i tabellen = LEGACY_ONLY. Detta är den
// konservativa defaulten — en enhet som aldrig fått en routingrad ska
// aldrig av misstag hamna i SHADOW.
export const DEFAULT_DIRECTION: RoutingDirection = "LEGACY_ONLY";

export async function getDirection(
  pool: pg.Pool,
  domain: string,
  careUnit: string,
): Promise<RoutingDirection> {
  const result = await pool.query(
    `SELECT direction FROM routing_config WHERE domain = $1 AND care_unit = $2`,
    [domain, careUnit],
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
    `INSERT INTO routing_config (domain, care_unit, direction, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (domain, care_unit)
     DO UPDATE SET direction = EXCLUDED.direction, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING domain, care_unit, direction, updated_at, updated_by`,
    [params.domain, params.careUnit, params.direction, params.updatedBy],
  );
  const row = result.rows[0];

  // Auditeras EFTER lyckad skrivning, inom samma synkrona flöde — om audit-
  // emitten kastar (Kafka nere och ingen Noop-fallback konfigurerad) ska
  // det synas högt, inte tystas, men själva routingändringen ska ändå stå
  // kvar (samma avvägning som fhir-facades escalateAuditError-mönster).
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
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export async function listRouting(pool: pg.Pool): Promise<RoutingRow[]> {
  const result = await pool.query(
    `SELECT domain, care_unit, direction, updated_at, updated_by FROM routing_config ORDER BY domain, care_unit`,
  );
  return result.rows.map((row) => ({
    domain: row.domain,
    careUnit: row.care_unit,
    direction: row.direction,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }));
}

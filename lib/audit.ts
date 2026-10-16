import type { Queryable } from "./db";

export async function writeAudit(
  db: Queryable,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.query(
    `insert into audit_events (actor_id, action, entity_type, entity_id, payload)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [actorId, action, entityType, entityId, JSON.stringify(payload)],
  );
}

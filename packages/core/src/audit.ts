import type { Database } from "@cloudcart/database";
import { newId, nowIso } from "@cloudcart/shared";

export interface AuditEntry {
  adminId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}

/** Administrative actions are recorded with actor, target and timestamp. */
export async function writeAuditLog(db: Database, entry: AuditEntry): Promise<void> {
  await db.run(
    `INSERT INTO audit_logs (id, admin_id, action, entity_type, entity_id, details_json, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId("aud"),
      entry.adminId ?? null,
      entry.action,
      entry.entityType ?? null,
      entry.entityId ?? null,
      JSON.stringify(entry.details ?? {}),
      entry.ip ?? null,
      nowIso(),
    ],
  );
}

export async function listAuditLogs(
  db: Database,
  page: number,
  perPage: number,
): Promise<{ items: Array<{ id: string; action: string; entity_type: string | null; entity_id: string | null; details_json: string; created_at: string; admin_email: string | null }>; total: number }> {
  const [count, list] = await db.batch([
    db.prepare("SELECT COUNT(*) AS count FROM audit_logs"),
    db.prepare(
      `SELECT l.id, l.action, l.entity_type, l.entity_id, l.details_json, l.created_at, a.email AS admin_email
       FROM audit_logs l LEFT JOIN admins a ON a.id = l.admin_id
       ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
      [perPage, (page - 1) * perPage],
    ),
  ]);
  return {
    items: (list?.results ?? []) as Array<{ id: string; action: string; entity_type: string | null; entity_id: string | null; details_json: string; created_at: string; admin_email: string | null }>,
    total: Number((count?.results?.[0] as { count?: number } | undefined)?.count ?? 0),
  };
}

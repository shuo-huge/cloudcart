import type { Database } from "@cloudcart/database";
import type { StoreIdentityRow } from "@cloudcart/database";
import { nowIso } from "@cloudcart/shared";

function newStoreId(): string {
  return `store_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Stable per-installation id used as the JWT `store_id` claim. */
export async function getOrCreateStoreId(db: Database): Promise<string> {
  const existing = await db.first<StoreIdentityRow>(
    "SELECT * FROM store_identity WHERE id = 1",
  );
  if (existing) return existing.store_id;
  const now = nowIso();
  await db.run(
    "INSERT OR IGNORE INTO store_identity (id, store_id, created_at, updated_at) VALUES (1, ?, ?, ?)",
    [newStoreId(), now, now],
  );
  const created = await db.first<StoreIdentityRow>(
    "SELECT store_id FROM store_identity WHERE id = 1",
  );
  if (!created) throw new Error("The store identity could not be created.");
  return created.store_id;
}

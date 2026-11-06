import type { Database } from "@cloudcart/database";
import type { CustomerAddressRow, CustomerRow, OrderRow } from "@cloudcart/database";
import { HttpError, nowIso } from "@cloudcart/shared";

export async function listCustomers(
  db: Database,
  query: { page: number; perPage: number; search?: string },
): Promise<{ items: CustomerRow[]; total: number }> {
  const params: Array<string | number> = [];
  let where = "";
  if (query.search) {
    where = "WHERE email LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\'";
    const pattern = `%${query.search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    params.push(pattern, pattern);
  }
  const [count, list] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS count FROM customers ${where}`, params),
    db.prepare(
      `SELECT * FROM customers ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, query.perPage, (query.page - 1) * query.perPage],
    ),
  ]);
  return {
    items: (list?.results ?? []) as unknown as CustomerRow[],
    total: Number((count?.results?.[0] as { count?: number } | undefined)?.count ?? 0),
  };
}

export async function getCustomer(db: Database, id: string) {
  const customer = await db.first<CustomerRow>("SELECT * FROM customers WHERE id = ?", [id]);
  if (!customer) return null;
  const [orders, addresses] = await db.batch([
    db.prepare("SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50", [id]),
    db.prepare("SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, created_at DESC", [id]),
  ]);
  return {
    customer,
    orders: (orders?.results ?? []) as unknown as OrderRow[],
    addresses: (addresses?.results ?? []) as unknown as CustomerAddressRow[],
  };
}

export async function updateCustomerNotes(db: Database, id: string, notes: string): Promise<void> {
  const result = await db.run(
    "UPDATE customers SET notes = ?, updated_at = ? WHERE id = ?",
    [notes.slice(0, 10_000), nowIso(), id],
  );
  if (!result.meta.changes) throw new HttpError(404, "customer_not_found", "Customer not found.");
}

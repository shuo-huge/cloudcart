import type { Database } from "./db";

/**
 * Local resource accounting. Cloudflare does not expose per-request quota
 * counters to the application, so these numbers are CloudCart's own estimates
 * and are labelled as such in the admin UI. Real metrics must be read from the
 * Cloudflare dashboard.
 */
export class ResourceGuard {
  constructor(private readonly db: Database) {}

  async record(event: {
    apiRequests?: number;
    d1Reads?: number;
    d1Writes?: number;
    r2ClassA?: number;
    r2ClassB?: number;
  }, day = new Date().toISOString().slice(0, 10)): Promise<void> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO resource_usage (day, api_requests, d1_reads, d1_writes, r2_class_a, r2_class_b, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(day) DO UPDATE SET
         api_requests = api_requests + excluded.api_requests,
         d1_reads = d1_reads + excluded.d1_reads,
         d1_writes = d1_writes + excluded.d1_writes,
         r2_class_a = r2_class_a + excluded.r2_class_a,
         r2_class_b = r2_class_b + excluded.r2_class_b,
         updated_at = excluded.updated_at`,
      [
        day,
        event.apiRequests ?? 0,
        event.d1Reads ?? 0,
        event.d1Writes ?? 0,
        event.r2ClassA ?? 0,
        event.r2ClassB ?? 0,
        now,
      ],
    );
  }

  async today(day = new Date().toISOString().slice(0, 10)) {
    return this.db.first<{
      day: string;
      api_requests: number;
      d1_reads: number;
      d1_writes: number;
      r2_class_a: number;
      r2_class_b: number;
    }>("SELECT * FROM resource_usage WHERE day = ?", [day]);
  }

  async storageEstimate(): Promise<{ mediaBytes: number; mediaCount: number; productCount: number; orderCount: number }> {
    const [media, products, orders] = await this.db.batch([
      this.db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes FROM media"),
      this.db.prepare("SELECT COUNT(*) AS count FROM products"),
      this.db.prepare("SELECT COUNT(*) AS count FROM orders"),
    ]);
    const mediaRow = (media?.results?.[0] ?? {}) as { count?: number; bytes?: number };
    const productRow = (products?.results?.[0] ?? {}) as { count?: number };
    const orderRow = (orders?.results?.[0] ?? {}) as { count?: number };
    return {
      mediaBytes: mediaRow.bytes ?? 0,
      mediaCount: mediaRow.count ?? 0,
      productCount: productRow.count ?? 0,
      orderCount: orderRow.count ?? 0,
    };
  }
}

/** Free-tier reference values (Cloudflare, verified 2026-11-06). */
export const FREE_TIER_LIMITS = {
  workersRequestsPerDay: 100_000,
  workerCpuMsPerRequest: 10,
  workerMemoryMb: 128,
  subrequestsPerInvocation: 50,
  d1DatabasesPerAccount: 10,
  d1DatabaseBytes: 500 * 1024 * 1024,
  d1AccountBytes: 5 * 1024 * 1024 * 1024,
  d1RowsReadPerDay: 5_000_000,
  d1RowsWrittenPerDay: 100_000,
  d1QueriesPerInvocation: 50,
  r2StorageBytes: 10 * 1024 * 1024 * 1024,
  r2ClassAPerMonth: 1_000_000,
  r2ClassBPerMonth: 10_000_000,
  staticAssetsFilesPerVersion: 20_000,
  staticAssetMaxBytes: 25 * 1024 * 1024,
} as const;

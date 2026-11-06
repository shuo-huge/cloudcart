export type SqlValue = string | number | null;

/**
 * Thin wrapper around D1 prepared statements. Every query in CloudCart goes
 * through prepare()/bind(); user input is never concatenated into SQL.
 */
export class Database {
  constructor(private readonly d1: D1Database) {}

  get raw(): D1Database {
    return this.d1;
  }

  async all<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const stmt = params.length > 0 ? this.d1.prepare(sql).bind(...params) : this.d1.prepare(sql);
    const result = await stmt.all<T>();
    return result.results ?? [];
  }

  async first<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): Promise<T | null> {
    const stmt = params.length > 0 ? this.d1.prepare(sql).bind(...params) : this.d1.prepare(sql);
    return (await stmt.first<T>()) ?? null;
  }

  async run(sql: string, params: SqlValue[] = []): Promise<D1Result<unknown>> {
    const stmt = params.length > 0 ? this.d1.prepare(sql).bind(...params) : this.d1.prepare(sql);
    return stmt.run();
  }

  /** Atomic batch (wrapped in a transaction by D1). */
  async batch(statements: D1PreparedStatement[]): Promise<D1Result<unknown>[]> {
    if (statements.length === 0) return [];
    return this.d1.batch(statements);
  }

  prepare(sql: string, params: SqlValue[] = []): D1PreparedStatement {
    return params.length > 0 ? this.d1.prepare(sql).bind(...params) : this.d1.prepare(sql);
  }

  async exists(sql: string, params: SqlValue[] = []): Promise<boolean> {
    return (await this.first(sql, params)) !== null;
  }
}

export interface PageQuery {
  page: number;
  perPage: number;
  offset: number;
}

export function pageQuery(pageRaw: unknown, perPageRaw: unknown, maxPerPage = 100): PageQuery {
  const page = Math.max(1, Math.trunc(Number(pageRaw) || 1));
  const perPage = Math.min(maxPerPage, Math.max(1, Math.trunc(Number(perPageRaw) || 20)));
  return { page, perPage, offset: (page - 1) * perPage };
}

export function paginated<T>(items: T[], total: number, query: PageQuery) {
  return {
    items,
    pagination: {
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage)),
    },
  };
}

/** SQLite LIKE wildcard escaping for search terms. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

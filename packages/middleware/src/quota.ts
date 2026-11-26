export interface QuotaStore {
  getCount(key: string): Promise<number>;
  increment(key: string, ttlSeconds: number): Promise<number>;
}

/**
 * Zero-cost in-memory quota store (resets cleanly per UTC day).
 */
export class MemoryQuotaStore implements QuotaStore {
  private readonly map = new Map<string, { count: number; expiresAt: number }>();

  async getCount(key: string): Promise<number> {
    const entry = this.map.get(key);
    if (!entry) return 0;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return 0;
    }
    return entry.count;
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const now = Date.now();
    const existing = this.map.get(key);
    if (!existing || now > existing.expiresAt) {
      this.map.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 });
      return 1;
    }
    existing.count += 1;
    return existing.count;
  }

  clear(): void {
    this.map.clear();
  }
}

/**
 * Optional Upstash Redis REST adapter (500k free commands/month, zero extra dependencies).
 */
export class UpstashQuotaStore implements QuotaStore {
  constructor(
    private readonly restUrl: string,
    private readonly restToken: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async getCount(key: string): Promise<number> {
    const res = await this.fetchImpl(`${this.restUrl}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${this.restToken}` },
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { result: string | null };
    return data.result ? Number(data.result) || 0 : 0;
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const res = await this.fetchImpl(`${this.restUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.restToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, ttlSeconds, "NX"],
      ]),
    });
    if (!res.ok) throw new Error("Upstash quota increment failed");
    const data = (await res.json()) as Array<{ result: number }>;
    return Number(data[0]?.result ?? 1);
  }
}

export function createDefaultQuotaStore(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}
): QuotaStore {
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) {
    return new UpstashQuotaStore(url, token);
  }
  return new MemoryQuotaStore();
}

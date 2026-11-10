type Hits = Map<string, { exp: number; value: Promise<unknown> }>;
// Kept on globalThis, like the database connection: route handlers and pages can be bundled separately, and a cache that
// lived in module scope could not be cleared from the other side after a change.
const holder = globalThis as typeof globalThis & { __nclReadCache?: Hits };
const hits: Hits = (holder.__nclReadCache ??= new Map());

export function remember<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = hits.get(key);
  if (hit && hit.exp > now) return hit.value as Promise<T>;
  const value = load().catch((error: unknown) => {
    hits.delete(key);
    throw error;
  });
  hits.set(key, { exp: now + ttlMs, value });
  return value;
}

export function clearReadCache(): void {
  hits.clear();
}

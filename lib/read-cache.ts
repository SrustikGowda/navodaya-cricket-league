const hits = new Map<string, { exp: number; value: Promise<unknown> }>();

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

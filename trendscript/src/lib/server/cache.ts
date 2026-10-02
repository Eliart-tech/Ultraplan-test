/**
 * In-memory TTL cache for upstream calls. Avoids hammering free endpoints
 * (Google RSS) and burning paid quotas (Apify, SerpApi, Instagram's 30
 * hashtags / 7 days) when the same analysis is re-run within minutes.
 *
 * Per server instance only: on serverless platforms each instance has its
 * own cache, which is fine for this purpose.
 */

interface Entry {
  expires: number;
  value: Promise<unknown>;
}

const store = new Map<string, Entry>();
const MAX_ENTRIES = 500;

export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<{ value: T; cached: boolean }> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) {
    return { value: (await hit.value) as T, cached: true };
  }

  const value = load();
  store.set(key, { expires: now + ttlMs, value });
  if (store.size > MAX_ENTRIES) {
    for (const [k, entry] of store) {
      if (entry.expires <= now || store.size > MAX_ENTRIES) store.delete(k);
      if (store.size <= MAX_ENTRIES) break;
    }
  }

  try {
    return { value: await value, cached: false };
  } catch (error) {
    // Never cache failures.
    if (store.get(key)?.value === value) store.delete(key);
    throw error;
  }
}

/** Test helper. */
export function clearCache(): void {
  store.clear();
}

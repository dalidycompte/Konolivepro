/**
 * localCache.ts
 * Cache local persistant basé sur IndexedDB.
 * Stocke les données Supabase pour un accès hors-ligne instantané.
 * Stratégie : réseau d'abord, cache comme fallback.
 */

const DB_NAME = 'konolive_cache';
const DB_VERSION = 1;
const STORE_NAME = 'cache';

interface CacheEntry<T> {
  key: string;
  data: T;
  timestamp: number;
  /** Durée de vie en ms (défaut : 15 minutes) */
  ttl: number;
}

function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

/** Sauvegarde une entrée dans le cache */
export async function cacheSet<T>(
  key: string,
  data: T,
  ttlMs = 15 * 60 * 1000
): Promise<void> {
  const db = await openCacheDB();
  const entry: CacheEntry<T> = { key, data, timestamp: Date.now(), ttl: ttlMs };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Récupère une entrée du cache (null si expirée ou absente) */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const db = await openCacheDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => {
      const entry = req.result as CacheEntry<T> | undefined;
      if (!entry) { resolve(null); return; }
      const expired = Date.now() - entry.timestamp > entry.ttl;
      resolve(expired ? null : entry.data);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Supprime une entrée du cache */
export async function cacheDelete(key: string): Promise<void> {
  const db = await openCacheDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Vide entièrement le cache */
export async function cacheClear(): Promise<void> {
  const db = await openCacheDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Wrapper réseau-d'abord avec cache en fallback.
 * Exécute `fetcher()` en ligne ; en cas d'erreur réseau, retourne le cache.
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 15 * 60 * 1000
): Promise<{ data: T; fromCache: boolean }> {
  try {
    const data = await fetcher();
    await cacheSet(key, data, ttlMs);
    return { data, fromCache: false };
  } catch {
    const cached = await cacheGet<T>(key);
    if (cached !== null) return { data: cached, fromCache: true };
    throw new Error('Données non disponibles hors ligne.');
  }
}

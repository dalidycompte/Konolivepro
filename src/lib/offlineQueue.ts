/**
 * offlineQueue.ts
 * File d'attente persistante basée sur IndexedDB pour les actions offline.
 * Permet de stocker les mutations (créer demande, uploader fichier, etc.)
 * et de les rejouer automatiquement lorsque la connexion revient.
 */

export type QueueItemType =
  | 'CREATE_REQUEST'
  | 'UPSERT_DOCUMENTS'
  | 'UPDATE_REQUEST_STATUS'
  | 'CREATE_NOTIFICATION';

export interface QueueItem {
  id: string;
  type: QueueItemType;
  payload: Record<string, unknown>;
  /** Fichiers encodés en base64 pour les uploads offline */
  files?: Record<string, string>; // clé → base64 data URL
  timestamp: number;
  retries: number;
  maxRetries: number;
}

const DB_NAME = 'konolive_offline';
const DB_VERSION = 1;
const STORE_NAME = 'queue';

// Ouvre (ou crée) la base IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

/** Ajoute un élément dans la file d'attente */
export async function enqueue(
  type: QueueItemType,
  payload: Record<string, unknown>,
  files?: Record<string, string>
): Promise<string> {
  const item: QueueItem = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type,
    payload,
    files,
    timestamp: Date.now(),
    retries: 0,
    maxRetries: 3,
  };
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve(item.id);
    tx.onerror = () => reject(tx.error);
  });
}

/** Récupère tous les éléments en attente, triés par timestamp */
export async function getAll(): Promise<QueueItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () =>
      resolve((req.result as QueueItem[]).sort((a, b) => a.timestamp - b.timestamp));
    req.onerror = () => reject(req.error);
  });
}

/** Supprime un élément par son id (après succès) */
export async function remove(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Incrémente le compteur de tentatives d'un élément */
export async function incrementRetry(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      const item = req.result as QueueItem | undefined;
      if (item) {
        item.retries += 1;
        store.put(item);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Compte le nombre d'éléments en attente */
export async function count(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Vide entièrement la file (utilisé pour réinitialisation) */
export async function clearAll(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

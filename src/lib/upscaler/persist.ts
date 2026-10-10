'use client';

import type { EngineChoice, OutputFormat, ScaleFactor } from './types';

/**
 * IndexedDB session-persistence for finished results — lets completed
 * upscales survive a page reload without ever touching a server.
 *
 * Storage policy (bounded, best-effort):
 *  - at most MAX_ITEMS newest results
 *  - at most MAX_BYTES total (oldest evicted first)
 *  - originals are re-encoded to a capped JPEG preview (comparing after a
 *    reload uses the preview; within the live session the full original is
 *    still available). The source File itself is not kept — re-upscaling a
 *    restored item is intentionally unavailable.
 *  - every failure is swallowed (private mode / quota) — persistence is a
 *    bonus, never a requirement.
 */

const DB_NAME = 'pixelforge';
const STORE = 'results';
const DB_VERSION = 1;

export const MAX_PERSIST_ITEMS = 12;
export const MAX_PERSIST_BYTES = 96 * 1024 * 1024;

export interface PersistedResult {
  /** source image pixel size */
  w: number;
  h: number;
  sizeIn: number;
  name: string;
  mime: string;
  thumb: Blob;
  /** capped preview of the original (for compare after reload) */
  original: Blob;
  result: {
    blob: Blob;
    w: number;
    h: number;
    ms: number;
    scale: ScaleFactor;
    format: OutputFormat;
    clamped: boolean;
    /** target-mode: exact longest side the output was sized to */
    target?: number;
    /** engine that produced the result (older rows default to standard) */
    engine?: EngineChoice;
    tiles?: number;
  };
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result: T | undefined;
      const req = fn(store);
      if (req) {
        req.onsuccess = () => {
          result = req.result;
        };
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB error'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB aborted'));
    });
  } finally {
    db.close();
  }
}

export async function idbPutResult(id: string, data: PersistedResult): Promise<void> {
  try {
    await withStore('readwrite', (store) => {
      store.put({ ...data, id });
    });
    await idbEvict();
  } catch {
    /* quota / private mode — persistence is best-effort */
  }
}

export async function idbDeleteResult(id: string): Promise<void> {
  try {
    await withStore('readwrite', (store) => {
      store.delete(id);
    });
  } catch {
    /* ignore */
  }
}

export async function idbClearResults(): Promise<void> {
  try {
    await withStore('readwrite', (store) => {
      store.clear();
    });
  } catch {
    /* ignore */
  }
}

/** All persisted results, newest first. */
export async function idbLoadResults(): Promise<Array<PersistedResult & { id: string }>> {
  try {
    const db = await openDb();
    try {
      const rows = await new Promise<Array<PersistedResult & { id: string }>>(
        (resolve, reject) => {
          const tx = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).getAll();
          tx.oncomplete = () =>
            resolve((req.result ?? []) as Array<PersistedResult & { id: string }>);
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB error'));
          tx.onabort = () => reject(tx.error ?? new Error('IndexedDB aborted'));
        }
      );
      return rows.sort((a, b) => b.savedAt - a.savedAt);
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

/** Keep only the newest MAX_PERSIST_ITEMS / MAX_PERSIST_BYTES entries. */
async function idbEvict(): Promise<void> {
  try {
    const rows = await idbLoadResults();
    const doomed: string[] = [];
    let bytes = 0;
    rows.forEach((row, i) => {
      bytes += row.thumb.size + row.original.size + row.result.blob.size;
      if (i >= MAX_PERSIST_ITEMS || bytes > MAX_PERSIST_BYTES) doomed.push(row.id);
    });
    if (doomed.length) {
      await withStore('readwrite', (store) => {
        for (const id of doomed) store.delete(id);
      });
    }
  } catch {
    /* ignore */
  }
}

/** Approximate total bytes currently persisted (for diagnostics). */
export async function idbBytesUsed(): Promise<number> {
  const rows = await idbLoadResults();
  return rows.reduce(
    (acc, r) => acc + r.thumb.size + r.original.size + r.result.blob.size,
    0
  );
}

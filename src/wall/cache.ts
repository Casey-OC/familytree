// A small on-computer store for the Family Wall: the last feed (so it shows offline)
// and posts, comments and likes waiting to send. Uses the app's built-in browser storage (IndexedDB).

const DB = 'familytree-wall';
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('No storage'));
  if (!dbp)
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  return dbp;
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T | undefined>((res, rej) => {
      const q = db.transaction('kv').objectStore('kv').get(key);
      q.onsuccess = () => res(q.result as T | undefined);
      q.onerror = () => rej(q.error);
    });
  } catch {
    return undefined;
  }
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((res, rej) => {
      const t = db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(value, key);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  } catch {
    /* the wall still works, it just won't be saved for offline */
  }
}

export async function cacheClear(prefix: string): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((res, rej) => {
      const t = db.transaction('kv', 'readwrite');
      const s = t.objectStore('kv');
      const q = s.openCursor();
      q.onsuccess = () => {
        const c = q.result;
        if (!c) return;
        if (String(c.key).startsWith(prefix)) c.delete();
        c.continue();
      };
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  } catch {
    /* nothing saved */
  }
}

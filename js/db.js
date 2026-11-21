/*
 * AstroTPV · db.js
 * Capa de persistencia local sobre IndexedDB. Todo se guarda en el dispositivo:
 * el TPV funciona al 100 % sin conexión a internet.
 */
(function () {
  'use strict';
  const DB_NAME = 'astrotpv';
  const DB_VERSION = 1;

  const SCHEMA = {
    settings: { keyPath: 'key' },
    meta: { keyPath: 'key' },
    users: { keyPath: 'id' },
    categories: { keyPath: 'id' },
    products: { keyPath: 'id', indexes: { barcode: 'barcode', categoryId: 'categoryId' } },
    sales: { keyPath: 'id', indexes: { date: 'date', shiftId: 'shiftId', number: 'number' } },
    shifts: { keyPath: 'id', indexes: { status: 'status', openedAt: 'openedAt' } },
    cashMoves: { keyPath: 'id', indexes: { shiftId: 'shiftId' } },
    stockMoves: { keyPath: 'id', indexes: { productId: 'productId', date: 'date' } },
    orders: { keyPath: 'id' },
    audit: { keyPath: 'id', indexes: { date: 'date' } }
  };
  const STORES = Object.keys(SCHEMA);

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, def] of Object.entries(SCHEMA)) {
          if (db.objectStoreNames.contains(name)) continue;
          const store = db.createObjectStore(name, { keyPath: def.keyPath });
          for (const [idx, path] of Object.entries(def.indexes || {})) store.createIndex(idx, path, { unique: false });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); location.reload(); };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña.'));
    });
    return dbPromise;
  }

  const wrap = (req) => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  /**
   * Transacción atómica sobre varios almacenes. `fn` recibe un helper con
   * get/put/del/all/index. Sólo se deben esperar promesas de este helper dentro de `fn`.
   */
  async function tx(storeNames, mode, fn) {
    const db = await open();
    const t = db.transaction(storeNames, mode);
    const api = {
      get: (s, k) => wrap(t.objectStore(s).get(k)),
      put: (s, v) => wrap(t.objectStore(s).put(v)),
      del: (s, k) => wrap(t.objectStore(s).delete(k)),
      all: (s) => wrap(t.objectStore(s).getAll()),
      clear: (s) => wrap(t.objectStore(s).clear()),
      index: (s, i, q) => wrap(t.objectStore(s).index(i).getAll(q))
    };
    const done = new Promise((resolve, reject) => {
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transacción abortada'));
    });
    let result;
    try {
      result = await fn(api);
    } catch (e) {
      try { t.abort(); } catch (_) { /* ya finalizada */ }
      throw e;
    }
    await done;
    return result;
  }

  const get = (s, k) => tx([s], 'readonly', (a) => a.get(s, k));
  const all = (s) => tx([s], 'readonly', (a) => a.all(s));
  const put = (s, v) => tx([s], 'readwrite', (a) => a.put(s, v));
  const del = (s, k) => tx([s], 'readwrite', (a) => a.del(s, k));
  const byIndex = (s, i, q) => tx([s], 'readonly', (a) => a.index(s, i, q));
  const range = (lower, upper) => IDBKeyRange.bound(lower, upper);

  function uid() {
    if (self.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /** Incrementa un contador (numeración de tickets) dentro de una transacción */
  async function nextSeq(api, key) {
    const cur = (await api.get('meta', key)) || { key, value: 0 };
    cur.value += 1;
    await api.put('meta', cur);
    return cur.value;
  }

  async function exportAll() {
    const data = { app: 'AstroTPV', version: DB_VERSION, exportedAt: new Date().toISOString(), stores: {} };
    await tx(STORES, 'readonly', async (a) => {
      for (const s of STORES) data.stores[s] = await a.all(s);
    });
    return data;
  }

  async function importAll(data) {
    if (!data || data.app !== 'AstroTPV' || !data.stores) throw new Error('El archivo no es una copia de seguridad de AstroTPV.');
    await tx(STORES, 'readwrite', async (a) => {
      for (const s of STORES) {
        await a.clear(s);
        for (const row of data.stores[s] || []) await a.put(s, row);
      }
    });
  }

  async function wipe() {
    await tx(STORES, 'readwrite', async (a) => { for (const s of STORES) await a.clear(s); });
  }

  /** SHA-256 de un PIN (no se guarda en claro) */
  async function hashPin(pin, salt) {
    const text = (salt || '') + ':' + String(pin);
    if (self.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback (contextos no seguros, p. ej. file://)
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
    return 'x' + (h >>> 0).toString(16);
  }

  self.TPVDB = { open, tx, get, all, put, del, byIndex, range, uid, nextSeq, exportAll, importAll, wipe, hashPin, STORES };
})();

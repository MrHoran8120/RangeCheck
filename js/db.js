(() => {
  const DB_NAME = 'rangecheck-db';
  const DB_VERSION = 1;
  const STORE = 'entries';
  const FALLBACK_KEY = 'RANGECHECK_FALLBACK_ENTRIES_V1';
  let idbUnavailable = false;

  // Simple localStorage fallback when IndexedDB is unavailable (e.g., some privacy modes)
  function fbReadAll() {
    try {
      const raw = localStorage.getItem(FALLBACK_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  function fbWriteAll(arr) {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(arr));
  }
  function fbNextId(arr) {
    let max = 0;
    for (const it of arr) if (it.id && it.id > max) max = it.id;
    return max + 1;
  }

  function openDB() {
    if (!('indexedDB' in window) || idbUnavailable) {
      idbUnavailable = true;
      return Promise.reject(new Error('IndexedDB unavailable'));
    }
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          os.createIndex('synced', 'synced', { unique: false });
          os.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        idbUnavailable = true;
        reject(req.error || new Error('IndexedDB open failed'));
      };
    });
  }

  async function withStore(mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const res = fn(store);
      tx.oncomplete = () => resolve(res);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function addEntry(entry) {
    const data = { ...entry, synced: false, createdAt: Date.now() };
    try {
      return await withStore('readwrite', (store) => store.add(data));
    } catch (e) {
      // Fallback to localStorage on any IDB failure
      idbUnavailable = true;
      const all = fbReadAll();
      data.id = fbNextId(all);
      all.push(data);
      fbWriteAll(all);
      return data.id;
    }
  }

  async function listEntries(limit = 50) {
    if (idbUnavailable || !('indexedDB' in window)) {
      const all = fbReadAll().sort((a, b) => b.createdAt - a.createdAt);
      return Promise.resolve(all.slice(0, limit));
    }
    return withStore('readonly', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.index('createdAt').openCursor(null, 'prev');
        const items = [];
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor && items.length < limit) {
            items.push(cursor.value);
            cursor.continue();
          } else {
            resolve(items);
          }
        };
        req.onerror = () => reject(req.error);
      });
    });
  }

  async function listPending() {
    if (idbUnavailable || !('indexedDB' in window)) {
      const all = fbReadAll();
      return Promise.resolve(all.filter(it => !it.synced));
    }
    return withStore('readonly', (store) => {
      return new Promise((resolve, reject) => {
        // Avoid boolean key ranges (not valid keys in IndexedDB)
        const req = store.openCursor();
        const items = [];
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const v = cursor.value;
            if (!v.synced) items.push(v);
            cursor.continue();
          } else {
            resolve(items);
          }
        };
        req.onerror = () => reject(req.error);
      });
    });
  }

  async function markSynced(ids) {
    if (!ids || !ids.length) return;
    if (idbUnavailable || !('indexedDB' in window)) {
      const all = fbReadAll();
      const now = Date.now();
      for (const it of all) {
        if (ids.includes(it.id)) {
          it.synced = true;
          it.syncedAt = now;
        }
      }
      fbWriteAll(all);
      return;
    }
    return withStore('readwrite', (store) => {
      ids.forEach((id) => {
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const val = getReq.result;
          if (!val) return;
          val.synced = true;
          val.syncedAt = Date.now();
          store.put(val);
        };
      });
    });
  }

  window.RangeDB = { addEntry, listEntries, listPending, markSynced };
})();

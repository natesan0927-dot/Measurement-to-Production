/*
 * Saving on this device (IndexedDB, which has room for photos).
 * jobs: one record per site visit, holding its windows/ventilators.
 * kv:   settings and counters.
 */
window.DB = (function () {
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open('m2p', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('jobs')) db.createObjectStore('jobs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }
  function run(store, mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }
  return {
    allJobs: () => run('jobs', 'readonly', (s) => s.getAll()),
    getJob: (id) => run('jobs', 'readonly', (s) => s.get(id)),
    putJob: (job) => run('jobs', 'readwrite', (s) => s.put(job)),
    deleteJob: (id) => run('jobs', 'readwrite', (s) => s.delete(id)),
    get: (key) => run('kv', 'readonly', (s) => s.get(key)),
    set: (key, val) => run('kv', 'readwrite', (s) => s.put(val, key)),
  };
})();

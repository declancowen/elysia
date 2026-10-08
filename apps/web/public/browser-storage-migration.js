// Run before theme boot and module imports so existing preferences and connections survive.
(() => {
  const marker = "elysia:brand-storage-migrated:v1";

  function migrateStorage(getStorage) {
    let storage;
    let entries;
    try {
      storage = getStorage();
      if (storage.getItem(marker) === "1") return;
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
      entries = [];
      for (const key of keys) {
        if (!key) continue;
        const nextKey = key.replace(/^(?:t3code|t3)([:.])/, "elysia$1");
        if (nextKey === key || storage.getItem(nextKey) !== null) continue;
        const value = storage.getItem(key);
        if (value !== null) entries.push([nextKey, value]);
      }
    } catch {
      // Blocked storage stays usable through the app's existing in-memory fallbacks.
      return;
    }
    // A failed copy must stop boot rather than hide accessible drafts or preferences.
    for (const [nextKey, value] of entries) storage.setItem(nextKey, value);
    storage.setItem(marker, "1");
  }

  function openExistingDatabase(name) {
    return new Promise((resolve, reject) => {
      let missing = false;
      let blocked = false;
      const request = indexedDB.open(name);
      request.addEventListener("upgradeneeded", () => {
        missing = true;
        request.transaction.abort();
      });
      request.addEventListener("error", () => {
        if (missing) resolve(null);
        else reject(request.error);
      });
      request.addEventListener("blocked", () => {
        blocked = true;
        reject(new Error("Legacy browser storage is blocked."));
      });
      request.addEventListener("success", () => {
        if (blocked) request.result.close();
        else resolve(request.result);
      });
    });
  }

  async function readLegacyDatabase(name) {
    const database = await openExistingDatabase(name);
    if (!database) return null;
    return new Promise((resolve, reject) => {
      const names = Array.from(database.objectStoreNames);
      const snapshot = { version: database.version, stores: [] };
      if (names.length === 0) {
        database.close();
        resolve(snapshot);
        return;
      }
      const transaction = database.transaction(names, "readonly");
      for (const name of names) {
        const store = transaction.objectStore(name);
        const rows = [];
        snapshot.stores.push({
          name,
          keyPath: store.keyPath,
          autoIncrement: store.autoIncrement,
          rows,
        });
        const cursor = store.openCursor();
        cursor.addEventListener("success", () => {
          if (!cursor.result) return;
          rows.push({ key: cursor.result.key, value: cursor.result.value });
          cursor.result.continue();
        });
      }
      transaction.addEventListener("complete", () => {
        database.close();
        resolve(snapshot);
      });
      transaction.addEventListener("abort", () => {
        database.close();
        reject(transaction.error);
      });
    });
  }

  async function migrateDatabase(legacyName) {
    const nextName = legacyName.replace(/^t3code:/, "elysia:");
    const existing = await openExistingDatabase(nextName);
    if (existing) {
      existing.close();
      return;
    }
    const snapshot = await readLegacyDatabase(legacyName);
    if (!snapshot) return;
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(nextName, snapshot.version);
      request.addEventListener("upgradeneeded", (event) => {
        // Only a new database imports old records; later deletions must stay deleted.
        if (event.oldVersion !== 0) return;
        for (const { name, keyPath, autoIncrement, rows } of snapshot.stores) {
          const store = request.result.createObjectStore(name, { keyPath, autoIncrement });
          for (const { key, value } of rows) {
            if (keyPath === null) store.put(value, key);
            else store.put(value);
          }
        }
      });
      request.addEventListener("success", () => {
        request.result.close();
        resolve();
      });
      request.addEventListener("error", () => reject(request.error));
      request.addEventListener("blocked", () =>
        reject(new Error("Browser storage migration is blocked.")),
      );
    });
  }

  try {
    migrateStorage(() => window.localStorage);
    migrateStorage(() => window.sessionStorage);
    window.elysiaBrowserStorageMigration =
      typeof indexedDB === "undefined"
        ? Promise.resolve()
        : Promise.all(
            ["t3code:connection-runtime", "t3code:cloud-auth", "t3code:project-favicons"].map(
              migrateDatabase,
            ),
          ).then(() => undefined);
  } catch (cause) {
    window.elysiaBrowserStorageMigration = Promise.reject(cause);
  }
  // Bootstrap observes the same rejection and shows a boot error, preserving old data.
  window.elysiaBrowserStorageMigration.catch(() => {});
})();

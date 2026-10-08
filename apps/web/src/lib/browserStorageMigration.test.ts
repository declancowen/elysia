import { describe, expect, it, vi } from "vite-plus/test";

import migrationScript from "../../public/browser-storage-migration.js?raw";

function makeStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

function runMigration(
  localStorage: Storage,
  sessionStorage = makeStorage(),
  indexedDB?: ReturnType<typeof makeIndexedDb>,
) {
  const browser = {
    localStorage,
    sessionStorage,
    elysiaBrowserStorageMigration: Promise.resolve(),
  };
  new Function("window", "indexedDB", migrationScript)(browser, indexedDB);
  return browser.elysiaBrowserStorageMigration;
}

type Store = { keyPath: string | null; autoIncrement: boolean; rows: Map<string, unknown> };
type Database = { version: number; stores: Map<string, Store> };

class Request<T> extends EventTarget {
  result!: T;
  error: Error | null = null;
  transaction = { abort: () => {} };
}

// Event-driven storage double: upgrades commit atomically, cursors finish the read transaction.
function makeIndexedDb(initial: Record<string, Record<string, Record<string, unknown>>>) {
  const databases = new Map<string, Database>(
    Object.entries(initial).map(([name, stores]) => [
      name,
      {
        version: 1,
        stores: new Map(
          Object.entries(stores).map(([store, rows]) => [
            store,
            {
              keyPath: null,
              autoIncrement: false,
              rows: new Map(Object.entries(rows)),
            },
          ]),
        ),
      },
    ]),
  );
  let failNextUpgrade = false;
  let blockNextOpen = false;
  const closed = new Map<string, number>();
  const open = vi.fn((name: string, version?: number) => {
    const request = new Request<ReturnType<typeof handle>>();
    let aborted = false;
    request.transaction.abort = () => {
      aborted = true;
    };
    function handle(database: Database) {
      return {
        version: database.version,
        objectStoreNames: [...database.stores.keys()],
        close: () => {
          closed.set(name, (closed.get(name) ?? 0) + 1);
        },
        createObjectStore: (
          storeName: string,
          options: Pick<Store, "keyPath" | "autoIncrement">,
        ) => {
          const store = { ...options, rows: new Map<string, unknown>() };
          database.stores.set(storeName, store);
          return {
            put: (value: unknown, key: string) => {
              store.rows.set(key, value);
            },
          };
        },
        transaction: () => {
          const transaction = new EventTarget();
          let pending = 0;
          return Object.assign(transaction, {
            objectStore: (storeName: string) => {
              const store = database.stores.get(storeName)!;
              return {
                ...store,
                openCursor: () => {
                  pending += 1;
                  const rows = [...store.rows];
                  const cursor = new Request<{
                    key: string;
                    value: unknown;
                    continue: () => void;
                  } | null>();
                  const advance = () =>
                    queueMicrotask(() => {
                      const entry = rows.shift();
                      cursor.result = entry
                        ? { key: entry[0], value: entry[1], continue: advance }
                        : null;
                      cursor.dispatchEvent(new Event("success"));
                      if (!entry && --pending === 0)
                        transaction.dispatchEvent(new Event("complete"));
                    });
                  advance();
                  return cursor;
                },
              };
            },
          });
        },
      };
    }
    queueMicrotask(() => {
      if (blockNextOpen) {
        blockNextOpen = false;
        request.dispatchEvent(new Event("blocked"));
      }
      const existing = databases.get(name);
      const database = existing ?? { version: version ?? 1, stores: new Map<string, Store>() };
      request.result = handle(database);
      if (!existing) {
        request.dispatchEvent(Object.assign(new Event("upgradeneeded"), { oldVersion: 0 }));
        if (version && failNextUpgrade) {
          aborted = true;
          failNextUpgrade = false;
        }
      }
      if (aborted) {
        request.error = new Error("Upgrade aborted");
        request.dispatchEvent(new Event("error"));
      } else {
        databases.set(name, database);
        request.dispatchEvent(new Event("success"));
      }
    });
    return request;
  });
  return {
    open,
    databases,
    closed,
    blockNextOpen: () => {
      blockNextOpen = true;
    },
    abortNextCopy: () => {
      failNextUpgrade = true;
    },
  };
}

describe("browser storage brand migration", () => {
  it("closes a late database connection after a blocked migration fails", async () => {
    const factory = makeIndexedDb({
      "elysia:connection-runtime": { catalog: { document: "remote" } },
    });
    factory.blockNextOpen();
    await expect(runMigration(makeStorage(), makeStorage(), factory)).rejects.toThrow(
      "Legacy browser storage is blocked",
    );
    expect(factory.closed.get("elysia:connection-runtime")).toBe(1);
  });

  it("preserves existing preferences, drafts, session state and the legacy values", async () => {
    const local = makeStorage({
      "t3code:composer-drafts:v1": '{"draft":"hello"}',
      "t3code.theme": "dark",
      "t3.preferences": "old",
      unrelated: "stay",
    });
    const session = makeStorage({ "t3.pullRequests.list:host": "filters" });
    await runMigration(local, session);
    expect(local.getItem("elysia:composer-drafts:v1")).toBe('{"draft":"hello"}');
    expect(local.getItem("elysia.theme")).toBe("dark");
    expect(local.getItem("elysia.preferences")).toBe("old");
    expect(local.getItem("t3code:composer-drafts:v1")).toBe('{"draft":"hello"}');
    expect(local.getItem("unrelated")).toBe("stay");
    expect(session.getItem("elysia.pullRequests.list:host")).toBe("filters");
  });

  it("keeps Elysia values and does not resurrect removed values on later boots", async () => {
    const local = makeStorage({
      "t3code:theme": "old",
      "elysia:theme": "new",
      "t3:welcome": "seen",
    });
    const session = makeStorage({
      "t3.pullRequests.list:host": "old",
      "elysia.pullRequests.list:host": "new",
    });
    await runMigration(local, session);
    expect(local.getItem("elysia:theme")).toBe("new");
    expect(session.getItem("elysia.pullRequests.list:host")).toBe("new");
    local.removeItem("elysia:welcome");
    session.removeItem("elysia.pullRequests.list:host");
    await runMigration(local, session);
    expect(local.getItem("elysia:welcome")).toBeNull();
    expect(session.getItem("elysia.pullRequests.list:host")).toBeNull();
  });

  it("allows the existing fallback when original storage cannot be read", async () => {
    const local = makeStorage({ "t3code:theme": "dark" });
    const read = vi.spyOn(local, "getItem").mockImplementation(() => {
      throw new Error("Storage disabled");
    });
    await expect(runMigration(local)).resolves.toBeUndefined();
    read.mockRestore();
    expect(local.getItem("t3code:theme")).toBe("dark");
    expect(local.getItem("elysia:brand-storage-migrated:v1")).toBeNull();
  });

  it("retains old data and retries if writing the new keys is blocked", async () => {
    const local = makeStorage({ "t3code:theme": "dark" });
    const write = vi.spyOn(local, "setItem").mockImplementationOnce(() => {
      throw new Error("Quota exceeded");
    });
    await expect(runMigration(local)).rejects.toThrow("Quota exceeded");
    expect(local.getItem("t3code:theme")).toBe("dark");
    expect(local.getItem("elysia:brand-storage-migrated:v1")).toBeNull();
    write.mockRestore();
    await runMigration(local);
    expect(local.getItem("elysia:theme")).toBe("dark");
  });

  it("copies connection/auth/cache databases and retains the originals", async () => {
    const factory = makeIndexedDb({
      "t3code:connection-runtime": {
        catalog: { document: { connections: ["remote"] } },
        thread: { draft: "hello" },
      },
      "t3code:cloud-auth": { keys: { "relay-dpop-proof-key": { privateKey: "opaque-key" } } },
      "t3code:project-favicons": { images: { project: "icon" } },
    });
    await runMigration(makeStorage(), makeStorage(), factory);
    for (const suffix of ["connection-runtime", "cloud-auth", "project-favicons"]) {
      expect(factory.databases.get(`elysia:${suffix}`)).toEqual(
        factory.databases.get(`t3code:${suffix}`),
      );
    }
    const migrated = factory.databases.get("elysia:connection-runtime")!;
    migrated.stores.get("catalog")!.rows.delete("document");
    factory.open.mockClear();
    await runMigration(makeStorage(), makeStorage(), factory);
    expect(migrated.stores.get("catalog")!.rows.has("document")).toBe(false);
    expect(factory.open.mock.calls.some(([name]) => name.startsWith("t3code:"))).toBe(false);
  });

  it("keeps an existing Elysia database and does not create empty legacy databases", async () => {
    const factory = makeIndexedDb({
      "elysia:connection-runtime": { catalog: { document: "new connection" } },
      "t3code:connection-runtime": { catalog: { document: "old connection" } },
    });
    await runMigration(makeStorage(), makeStorage(), factory);
    expect(
      factory.databases
        .get("elysia:connection-runtime")!
        .stores.get("catalog")!
        .rows.get("document"),
    ).toBe("new connection");
    expect(factory.databases.has("t3code:cloud-auth")).toBe(false);
    expect(factory.databases.has("elysia:cloud-auth")).toBe(false);
  });

  it("fails closed on an aborted database copy and retries without losing legacy data", async () => {
    const factory = makeIndexedDb({
      "t3code:connection-runtime": { catalog: { document: "remote" } },
    });
    factory.abortNextCopy();
    await expect(runMigration(makeStorage(), makeStorage(), factory)).rejects.toThrow(
      "Upgrade aborted",
    );
    expect(factory.databases.has("elysia:connection-runtime")).toBe(false);
    expect(
      factory.databases
        .get("t3code:connection-runtime")!
        .stores.get("catalog")!
        .rows.get("document"),
    ).toBe("remote");
    await runMigration(makeStorage(), makeStorage(), factory);
    expect(
      factory.databases
        .get("elysia:connection-runtime")!
        .stores.get("catalog")!
        .rows.get("document"),
    ).toBe("remote");
  });
});

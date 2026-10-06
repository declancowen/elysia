// @effect-diagnostics nodeBuiltinImport:off preferSchemaOverJson:off -- exercises real temporary SQLite files and verifies the transitional JSON reviver.
import * as NodeFSP from "node:fs/promises";
import * as NodeChildProcess from "node:child_process";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";
import * as Effect from "effect/Effect";
import { afterEach, expect, vi } from "vite-plus/test";
import { it } from "@effect/vitest";
import { migrateLegacyDataHome } from "./legacyDataMigration.ts";
import { HostProcessPlatform } from "./hostProcess.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof NodeFSP>();
  return { ...original, rename: vi.fn(original.rename) };
});
vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof NodeChildProcess>();
  return { ...original, execFileSync: vi.fn(original.execFileSync) };
});

const homes: string[] = [];
afterEach(async () => {
  for (const home of homes.splice(0)) await NodeFSP.rm(home, { recursive: true, force: true });
});
async function home() {
  const path = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "elysia-migration-test-"));
  homes.push(path);
  return path;
}

it.effect("migrates chats and paths once, retaining an intact original backup", () =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(home);
    const old = NodePath.join(root, ".t3");
    const current = NodePath.join(root, ".elysia");
    yield* Effect.promise(() => NodeFSP.mkdir(NodePath.join(old, "userdata"), { recursive: true }));
    const db = new NodeSqlite.DatabaseSync(NodePath.join(old, "userdata", "statev2.sqlite"));
    db.exec(
      "CREATE TABLE chats (id TEXT PRIMARY KEY, text TEXT, workspace_root TEXT, payload_json TEXT)",
    );
    db.prepare("INSERT INTO chats VALUES (?, ?, ?, ?)").run(
      "chat-1",
      "Keep my chat exactly",
      `${old}/worktrees/a`,
      JSON.stringify({ cwd: `${old}/worktrees/a`, prompt: "T3 attribution" }),
    );
    db.close();
    yield* Effect.promise(() =>
      NodeFSP.writeFile(
        NodePath.join(old, "userdata", "settings.json"),
        JSON.stringify({ cwd: `${old}/worktrees/a` }),
      ),
    );
    yield* Effect.promise(() => NodeFSP.symlink(`${old}/worktrees/a`, NodePath.join(old, "link")));
    yield* migrateLegacyDataHome(current);
    const copy = new NodeSqlite.DatabaseSync(NodePath.join(current, "userdata", "statev2.sqlite"), {
      readOnly: true,
    });
    expect(copy.prepare("SELECT * FROM chats").get()).toMatchObject({
      id: "chat-1",
      text: "Keep my chat exactly",
      workspace_root: `${current}/worktrees/a`,
      payload_json: JSON.stringify({ cwd: `${current}/worktrees/a`, prompt: "T3 attribution" }),
    });
    copy.close();
    expect(yield* Effect.promise(() => NodeFSP.readlink(NodePath.join(current, "link")))).toBe(
      `${current}/worktrees/a`,
    );
    expect(
      JSON.parse(
        yield* Effect.promise(() =>
          NodeFSP.readFile(NodePath.join(current, "userdata", "settings.json"), "utf8"),
        ),
      ),
    ).toEqual({ cwd: `${current}/worktrees/a` });
    const entries = yield* Effect.promise(() => NodeFSP.readdir(root));
    expect(entries).not.toContain(".t3");
    const backup = entries.find((entry) => entry.includes("legacy-backup"));
    expect(backup).toBeDefined();
    const original = new NodeSqlite.DatabaseSync(
      NodePath.join(root, backup!, "userdata", "statev2.sqlite"),
      { readOnly: true },
    );
    expect(original.prepare("SELECT workspace_root FROM chats").get()?.workspace_root).toBe(
      `${old}/worktrees/a`,
    );
    original.close();
    // A later legacy folder must not restart a completed migration.
    yield* Effect.promise(() => NodeFSP.mkdir(old));
    yield* migrateLegacyDataHome(current);
    expect(yield* Effect.promise(() => NodeFSP.readdir(root))).toEqual(
      expect.arrayContaining(entries),
    );
  }),
);

it.effect("preserves a configuration-only destination while migrating the desktop profile", () =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(home);
    const old = NodePath.join(root, ".t3");
    const current = NodePath.join(root, ".elysia");
    for (const directory of [old, current])
      yield* Effect.promise(() =>
        NodeFSP.mkdir(NodePath.join(directory, "userdata"), { recursive: true }),
      );
    const configuration = "keep native CLI configuration";
    yield* Effect.promise(() => NodeFSP.writeFile(NodePath.join(current, "config"), configuration));
    const db = new NodeSqlite.DatabaseSync(NodePath.join(old, "userdata", "statev2.sqlite"));
    db.exec("CREATE TABLE chats (id TEXT); INSERT INTO chats VALUES ('legacy-chat')");
    db.close();
    yield* migrateLegacyDataHome(current);
    const migrated = new NodeSqlite.DatabaseSync(
      NodePath.join(current, "userdata", "statev2.sqlite"),
      {
        readOnly: true,
      },
    );
    expect(migrated.prepare("SELECT id FROM chats").get()?.id).toBe("legacy-chat");
    migrated.close();
    expect(
      yield* Effect.promise(() => NodeFSP.readFile(NodePath.join(current, "config"), "utf8")),
    ).toBe(configuration);
    const entries = yield* Effect.promise(() => NodeFSP.readdir(root));
    const backup = entries.find((entry) => entry.includes("pre-migration"));
    expect(backup).toBeDefined();
    expect(
      yield* Effect.promise(() => NodeFSP.readFile(NodePath.join(root, backup!, "config"), "utf8")),
    ).toBe(configuration);
    yield* migrateLegacyDataHome(current);
    expect(yield* Effect.promise(() => NodeFSP.readdir(root))).toEqual(entries);
  }),
);

it.effect("recovers an empty destination left by an earlier failed startup", () =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(home);
    const old = NodePath.join(root, ".t3");
    const current = NodePath.join(root, ".elysia");
    yield* Effect.promise(() => NodeFSP.mkdir(old));
    yield* Effect.promise(() =>
      NodeFSP.mkdir(NodePath.join(current, "userdata"), { recursive: true }),
    );
    yield* Effect.promise(() => NodeFSP.writeFile(NodePath.join(old, "settings.json"), "{}"));
    yield* migrateLegacyDataHome(current);
    expect(
      yield* Effect.promise(() =>
        NodeFSP.readFile(NodePath.join(current, "settings.json"), "utf8"),
      ),
    ).toBe("{}");
    expect(
      (yield* Effect.promise(() => NodeFSP.readdir(root))).some((entry) =>
        entry.includes("legacy-backup"),
      ),
    ).toBe(true);
  }),
);

it.effect("refuses conflicting configuration without changing either profile", () =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(home);
    for (const name of [".t3", ".elysia"]) {
      yield* Effect.promise(() => NodeFSP.mkdir(NodePath.join(root, name)));
      yield* Effect.promise(() => NodeFSP.writeFile(NodePath.join(root, name, "config"), name));
    }
    expect(
      (yield* migrateLegacyDataHome(NodePath.join(root, ".elysia")).pipe(Effect.flip)).message,
    ).toContain("preserve both");
    expect((yield* Effect.promise(() => NodeFSP.readdir(root))).sort()).toEqual([".elysia", ".t3"]);
    for (const name of [".t3", ".elysia"])
      expect(
        yield* Effect.promise(() => NodeFSP.readFile(NodePath.join(root, name, "config"), "utf8")),
      ).toBe(name);
  }),
);

it.effect("refuses a separate destination database outside userdata", () =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(home);
    yield* Effect.promise(() => NodeFSP.mkdir(NodePath.join(root, ".t3")));
    yield* Effect.promise(() => NodeFSP.mkdir(NodePath.join(root, ".elysia")));
    const db = new NodeSqlite.DatabaseSync(NodePath.join(root, ".elysia", "other.sqlite"));
    db.exec("CREATE TABLE records (id TEXT); INSERT INTO records VALUES ('keep')");
    db.close();
    yield* migrateLegacyDataHome(NodePath.join(root, ".elysia")).pipe(Effect.flip);
    expect((yield* Effect.promise(() => NodeFSP.readdir(root))).sort()).toEqual([".elysia", ".t3"]);
  }),
);

it.effect("does not replace conflicting symbolic links", () =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(home);
    for (const name of [".t3", ".elysia"]) {
      yield* Effect.promise(() => NodeFSP.mkdir(NodePath.join(root, name)));
      yield* Effect.promise(() =>
        NodeFSP.symlink(NodePath.join(root, `${name}-target`), NodePath.join(root, name, "link")),
      );
    }
    yield* migrateLegacyDataHome(NodePath.join(root, ".elysia")).pipe(Effect.flip);
    for (const name of [".t3", ".elysia"])
      expect(yield* Effect.promise(() => NodeFSP.readlink(NodePath.join(root, name, "link")))).toBe(
        NodePath.join(root, `${name}-target`),
      );
    expect((yield* Effect.promise(() => NodeFSP.readdir(root))).sort()).toEqual([".elysia", ".t3"]);
  }),
);

it.effect("restores the original destination if publishing the verified profile fails", () =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(home);
    const old = NodePath.join(root, ".t3");
    const current = NodePath.join(root, ".elysia");
    yield* Effect.promise(() => NodeFSP.mkdir(old));
    yield* Effect.promise(() => NodeFSP.mkdir(current));
    yield* Effect.promise(() => NodeFSP.writeFile(NodePath.join(current, "config"), "keep"));
    const rename = vi.mocked(NodeFSP.rename);
    const originalRename = rename.getMockImplementation()!;
    rename.mockImplementation(async (from, to) => {
      if (typeof from === "string" && from.startsWith(`${current}.migration-`))
        throw new Error("Cannot publish the staged profile");
      return originalRename(from, to);
    });
    try {
      yield* migrateLegacyDataHome(current).pipe(Effect.flip);
    } finally {
      rename.mockImplementation(originalRename);
    }
    expect(
      yield* Effect.promise(() => NodeFSP.readFile(NodePath.join(current, "config"), "utf8")),
    ).toBe("keep");
    expect((yield* Effect.promise(() => NodeFSP.readdir(root))).sort()).toEqual([".elysia", ".t3"]);
  }),
);

it.effect("keeps an existing Elysia profile when a separate legacy profile remains", () =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(home);
    const old = NodePath.join(root, ".t3");
    const current = NodePath.join(root, ".elysia");
    for (const directory of [old, current]) {
      yield* Effect.promise(() =>
        NodeFSP.mkdir(NodePath.join(directory, "userdata"), { recursive: true }),
      );
      const db = new NodeSqlite.DatabaseSync(
        NodePath.join(directory, "userdata", "statev2.sqlite"),
      );
      db.exec("CREATE TABLE chats (id TEXT PRIMARY KEY)");
      db.prepare("INSERT INTO chats VALUES (?)").run(directory === current ? "current" : "legacy");
      db.close();
    }
    yield* migrateLegacyDataHome(current);
    for (const directory of [old, current]) {
      const db = new NodeSqlite.DatabaseSync(
        NodePath.join(directory, "userdata", "statev2.sqlite"),
        {
          readOnly: true,
        },
      );
      try {
        expect(db.prepare("SELECT id FROM chats").get()?.id).toBe(
          directory === current ? "current" : "legacy",
        );
      } finally {
        db.close();
      }
    }
    expect((yield* Effect.promise(() => NodeFSP.readdir(root))).sort()).toEqual([".elysia", ".t3"]);
  }),
);

it.effect("blocks a running WAL database and preserves the source", () =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(home);
    const old = NodePath.join(root, ".t3");
    yield* Effect.promise(() => NodeFSP.mkdir(old));
    const db = new NodeSqlite.DatabaseSync(NodePath.join(old, "state.sqlite"));
    try {
      db.exec(
        "PRAGMA journal_mode=WAL; CREATE TABLE chats (id TEXT); INSERT INTO chats VALUES ('chat-1')",
      );
      expect(
        (yield* migrateLegacyDataHome(NodePath.join(root, ".elysia")).pipe(Effect.flip)).message,
      ).toContain("Close the previous app");
      expect(yield* Effect.promise(() => NodeFSP.readdir(root))).toEqual([".t3"]);
    } finally {
      db.close();
    }
  }),
);

it.effect("recovers committed WAL chats after a crash without deleting the original journal", () =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(home);
    const old = NodePath.join(root, ".t3");
    const current = NodePath.join(root, ".elysia");
    yield* Effect.promise(() => NodeFSP.mkdir(old));
    const path = NodePath.join(old, "state.sqlite");
    // Exit without closing SQLite, reproducing journals retained after a crash.
    const child = NodeChildProcess.spawnSync(process.execPath, [
      "--input-type=module",
      "-e",
      `import { DatabaseSync } from 'node:sqlite';
       const db = new DatabaseSync(process.argv[1]);
       db.exec("PRAGMA journal_mode=WAL; CREATE TABLE chats (id TEXT); INSERT INTO chats VALUES ('wal-chat')");
       process.exit(0);`,
      path,
    ]);
    expect(child.status, child.stderr.toString()).toBe(0);
    const journal = yield* Effect.promise(() => NodeFSP.readFile(`${path}-wal`));
    expect(journal.length).toBeGreaterThan(0);
    expect(yield* Effect.promise(() => NodeFSP.stat(`${path}-shm`))).toBeDefined();
    const platform = yield* HostProcessPlatform;
    const execute = vi.mocked(NodeChildProcess.execFileSync);
    const originalExecute = execute.getMockImplementation()!;
    // CI runs on Linux; emulate macOS's lsof no-owner result there.
    if (platform !== "darwin") {
      execute.mockImplementation(() => {
        throw Object.assign(new Error("No open files"), { status: 1, stdout: "", stderr: "" });
      });
    }
    try {
      yield* migrateLegacyDataHome(current).pipe(
        Effect.provideService(HostProcessPlatform, "darwin"),
      );
      const copy = new NodeSqlite.DatabaseSync(NodePath.join(current, "state.sqlite"), {
        readOnly: true,
      });
      try {
        expect(copy.prepare("SELECT id FROM chats").get()?.id).toBe("wal-chat");
      } finally {
        copy.close();
      }
      const entries = yield* Effect.promise(() => NodeFSP.readdir(root));
      const backup = entries.find((entry) => entry.includes("legacy-backup"))!;
      expect(
        yield* Effect.promise(() =>
          NodeFSP.readFile(NodePath.join(root, backup, "state.sqlite-wal")),
        ),
      ).toEqual(journal);
      yield* migrateLegacyDataHome(current).pipe(
        Effect.provideService(HostProcessPlatform, "darwin"),
      );
      expect(yield* Effect.promise(() => NodeFSP.readdir(root))).toEqual(entries);
    } finally {
      execute.mockImplementation(originalExecute);
    }
  }),
);

it.effect("blocks a macOS database owner even without WAL sidecars", () =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(home);
    const old = NodePath.join(root, ".t3");
    yield* Effect.promise(() => NodeFSP.mkdir(old));
    const db = new NodeSqlite.DatabaseSync(NodePath.join(old, "state.sqlite"));
    db.exec("CREATE TABLE chats (id TEXT); INSERT INTO chats VALUES ('keep')");
    const platform = yield* HostProcessPlatform;
    const execute = vi.mocked(NodeChildProcess.execFileSync);
    const originalExecute = execute.getMockImplementation()!;
    if (platform !== "darwin") {
      execute.mockReturnValue(`p${process.pid}\n`);
    }
    try {
      const error = yield* migrateLegacyDataHome(NodePath.join(root, ".elysia")).pipe(
        Effect.provideService(HostProcessPlatform, "darwin"),
        Effect.flip,
      );
      expect(String(error.cause)).toContain(`p${process.pid}`);
      expect(yield* Effect.promise(() => NodeFSP.readdir(root))).toEqual([".t3"]);
      expect(db.prepare("SELECT id FROM chats").get()?.id).toBe("keep");
    } finally {
      db.close();
      execute.mockImplementation(originalExecute);
    }
  }),
);

it.effect("fails closed when macOS cannot inspect database owners", () =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(home);
    const old = NodePath.join(root, ".t3");
    yield* Effect.promise(() => NodeFSP.mkdir(old));
    const db = new NodeSqlite.DatabaseSync(NodePath.join(old, "state.sqlite"));
    db.exec("CREATE TABLE chats (id TEXT); INSERT INTO chats VALUES ('keep')");
    db.close();
    const execute = vi.mocked(NodeChildProcess.execFileSync);
    const originalExecute = execute.getMockImplementation()!;
    execute.mockImplementation(() => {
      throw Object.assign(new Error("Cannot inspect files"), {
        status: 1,
        stdout: "",
        stderr: "Permission denied",
      });
    });
    try {
      const error = yield* migrateLegacyDataHome(NodePath.join(root, ".elysia")).pipe(
        Effect.provideService(HostProcessPlatform, "darwin"),
        Effect.flip,
      );
      expect(String(error.cause)).toContain("Could not verify");
      expect(yield* Effect.promise(() => NodeFSP.readdir(root))).toEqual([".t3"]);
    } finally {
      execute.mockImplementation(originalExecute);
    }
  }),
);

it.effect("leaves corrupt data in place and records no completion", () =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(home);
    yield* Effect.promise(() => NodeFSP.mkdir(NodePath.join(root, ".t3")));
    yield* Effect.promise(() =>
      NodeFSP.writeFile(NodePath.join(root, ".t3", "state.sqlite"), "broken database"),
    );
    expect(
      (yield* migrateLegacyDataHome(NodePath.join(root, ".elysia")).pipe(Effect.flip)).message,
    ).toContain("could not migrate");
    expect(yield* Effect.promise(() => NodeFSP.readdir(root))).toEqual([".t3"]);
  }),
);

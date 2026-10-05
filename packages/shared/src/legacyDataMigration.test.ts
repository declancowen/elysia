// @effect-diagnostics nodeBuiltinImport:off preferSchemaOverJson:off -- exercises real temporary SQLite files and verifies the transitional JSON reviver.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";
import * as Effect from "effect/Effect";
import { afterEach, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import { migrateLegacyDataHome } from "./legacyDataMigration.ts";

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

it.effect("refuses an ambiguous destination without changing either profile", () =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(home);
    yield* Effect.promise(() => NodeFSP.mkdir(NodePath.join(root, ".t3")));
    yield* Effect.promise(() => NodeFSP.mkdir(NodePath.join(root, ".elysia")));
    expect(
      (yield* migrateLegacyDataHome(NodePath.join(root, ".elysia")).pipe(Effect.flip)).message,
    ).toContain("preserve both");
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

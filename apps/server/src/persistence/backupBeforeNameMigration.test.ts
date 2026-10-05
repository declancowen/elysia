// @effect-diagnostics nodeBuiltinImport:off -- temporary SQLite fixture setup and cleanup only.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { it, assert } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { backupBeforeNameMigration } from "./backupBeforeNameMigration.ts";

it.effect("snapshots a pending rename once and preserves the original backup on retry", () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "elysia-backup-test-"));
  const dbPath = NodePath.join(root, "statev2.sqlite");
  const db = new NodeSqlite.DatabaseSync(dbPath);
  db.exec("CREATE TABLE chats (text TEXT); INSERT INTO chats VALUES ('Original chat')");
  return Effect.gen(function* () {
    yield* backupBeforeNameMigration(dbPath);
    const copy = new NodeSqlite.DatabaseSync(`${dbPath}.before-elysia-names.sqlite`, {
      readOnly: true,
    });
    try {
      assert.equal(copy.prepare("SELECT text FROM chats").get()?.text, "Original chat");
    } finally {
      copy.close();
    }
    db.exec("INSERT INTO chats VALUES ('New chat')");
    yield* backupBeforeNameMigration(dbPath);
    const retained = new NodeSqlite.DatabaseSync(`${dbPath}.before-elysia-names.sqlite`, {
      readOnly: true,
    });
    try {
      assert.equal(retained.prepare("SELECT count(*) AS count FROM chats").get()?.count, 1);
    } finally {
      retained.close();
    }
  }).pipe(
    Effect.provide(NodeServices.layer),
    Effect.ensuring(
      Effect.sync(() => {
        db.close();
        NodeFS.rmSync(root, { recursive: true, force: true });
      }),
    ),
  );
});

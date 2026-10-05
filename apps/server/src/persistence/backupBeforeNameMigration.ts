import * as NodeSqlite from "node:sqlite";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

class NameMigrationBackupError extends Schema.TaggedError<NameMigrationBackupError>()(
  "NameMigrationBackupError",
  { dbPath: Schema.String, cause: Schema.Defect() },
) {
  override get message() {
    return `Elysia could not back up ${this.dbPath} before migrating its tool names. Startup stopped; the original database is preserved.`;
  }
}

function verifyBackup(path: string) {
  const database = new NodeSqlite.DatabaseSync(path, { readOnly: true });
  try {
    if (database.prepare("PRAGMA quick_check").get()?.quick_check !== "ok") {
      throw new Error("The migration backup failed its integrity check.");
    }
  } finally {
    database.close();
  }
}

export const backupBeforeNameMigration = Effect.fn("backupBeforeNameMigration")(function* (
  dbPath: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (!(yield* fs.exists(dbPath))) return;
  yield* Effect.gen(function* () {
    const pending = yield* Effect.try(() => {
      const db = new NodeSqlite.DatabaseSync(dbPath, { readOnly: true });
      try {
        const ledger = db
          .prepare(
            "SELECT 1 FROM sqlite_schema WHERE type='table' AND name='effect_sql_migrations'",
          )
          .get();
        return (
          ledger === undefined ||
          db.prepare("SELECT 1 FROM effect_sql_migrations WHERE migration_id >= 61").get() ===
            undefined
        );
      } finally {
        db.close();
      }
    });
    if (!pending) return;
    const backupPath = `${dbPath}.before-elysia-names.sqlite`;
    if (yield* fs.exists(backupPath)) {
      yield* Effect.try(() => verifyBackup(backupPath));
      return;
    }
    const snapshot = yield* fs.makeTempFileScoped({
      directory: path.dirname(dbPath),
      suffix: ".sqlite",
    });
    yield* Effect.tryPromise(async () => {
      const db = new NodeSqlite.DatabaseSync(dbPath, { readOnly: true });
      try {
        await NodeSqlite.backup(db, snapshot);
        verifyBackup(snapshot);
      } finally {
        db.close();
      }
    });
    yield* fs.link(snapshot, backupPath).pipe(
      Effect.catchIf(
        (error) => error.reason._tag === "AlreadyExists",
        () => Effect.void,
      ),
    );
  }).pipe(
    Effect.scoped,
    Effect.mapError((cause) => new NameMigrationBackupError({ dbPath, cause })),
  );
});

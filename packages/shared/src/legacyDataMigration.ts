// @effect-diagnostics nodeBuiltinImport:off preferSchemaOverJson:off -- one-release startup migration uses native SQLite/FS and a JSON reviver before app services open the profile.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class LegacyDataMigrationError extends Schema.TaggedError<LegacyDataMigrationError>()(
  "LegacyDataMigrationError",
  { destination: Schema.String, cause: Schema.Defect() },
) {
  override get message(): string {
    return `Elysia could not migrate its previous data folder to ${this.destination}. Close the previous app and retry. If both data folders exist, preserve both and resolve the conflict before starting Elysia.`;
  }
}

const exists = async (path: string) => {
  try {
    await NodeFSP.lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

async function databasePaths(directory: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await NodeFSP.readdir(directory, { withFileTypes: true })) {
    const path = NodePath.join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await databasePaths(path)));
    else if (entry.isFile() && entry.name.endsWith(".sqlite")) paths.push(path);
  }
  return paths;
}

async function copyConfiguration(source: string, destination: string) {
  for (const entry of await NodeFSP.readdir(source, { withFileTypes: true })) {
    const from = NodePath.join(source, entry.name);
    const to = NodePath.join(destination, entry.name);
    if (await exists(to)) {
      if (entry.isDirectory() && (await NodeFSP.lstat(to)).isDirectory()) {
        await copyConfiguration(from, to);
      } else {
        throw new Error(`Conflicting configuration at ${from}; refusing to overwrite either file.`);
      }
    } else {
      await NodeFSP.cp(from, to, {
        recursive: true,
        verbatimSymlinks: true,
        force: false,
        errorOnExist: true,
      });
    }
  }
}

async function assertClosed(databases: readonly string[]) {
  for (const path of databases) {
    // WAL shared memory is present while the old app owns its database. Never
    // move its live profile, even though SQLite can take a consistent snapshot.
    if (await exists(`${path}-shm`)) throw new Error("The previous database is still open.");
  }
}

function inspectDatabase(database: NodeSqlite.DatabaseSync) {
  const check = database.prepare("PRAGMA quick_check").get();
  if (check?.quick_check !== "ok") throw new Error("Database integrity check failed.");
  const tables = database
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  return tables.map(({ name }) => {
    if (typeof name !== "string") throw new Error("Invalid table name.");
    const quoted = `"${name.replaceAll('"', '""')}"`;
    return [name, database.prepare(`SELECT count(*) AS count FROM ${quoted}`).get()?.count];
  });
}

const quotedIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

function rewritePath(value: string, source: string, destination: string) {
  return value === source || value.startsWith(`${source}${NodePath.sep}`)
    ? destination + value.slice(source.length)
    : value;
}

function rewriteJsonPaths(value: string, source: string, destination: string) {
  return JSON.stringify(
    JSON.parse(value, (_key, entry: unknown) =>
      typeof entry === "string" ? rewritePath(entry, source, destination) : entry,
    ),
  );
}

async function retargetFiles(directory: string, source: string, destination: string) {
  for (const entry of await NodeFSP.readdir(directory, { withFileTypes: true })) {
    const path = NodePath.join(directory, entry.name);
    if (entry.isDirectory()) await retargetFiles(path, source, destination);
    else if (entry.isSymbolicLink()) {
      const target = await NodeFSP.readlink(path);
      const rewritten = rewritePath(target, source, destination);
      if (rewritten !== target) {
        await NodeFSP.unlink(path);
        await NodeFSP.symlink(rewritten, path);
      }
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      const content = await NodeFSP.readFile(path, "utf8");
      if (!content.includes(source)) continue;
      const rewritten = rewriteJsonPaths(content, source, destination);
      await NodeFSP.writeFile(path, rewritten);
    }
  }
}

function retargetDatabase(database: NodeSqlite.DatabaseSync, source: string, destination: string) {
  const tables = database
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND sql NOT LIKE 'CREATE VIRTUAL TABLE%' AND sql NOT LIKE '%WITHOUT ROWID%'",
    )
    .all();
  for (const { name } of tables) {
    if (typeof name !== "string") continue;
    const table = quotedIdentifier(name);
    const columns = database.prepare(`PRAGMA table_info(${table})`).all();
    for (const column of columns) {
      if (typeof column.name !== "string" || column.type !== "TEXT") continue;
      const field = quotedIdentifier(column.name);
      const rows = database
        .prepare(
          `SELECT rowid AS migration_id, ${field} AS value FROM ${table} WHERE instr(${field}, ?) > 0`,
        )
        .all(source);
      for (const row of rows) {
        if (typeof row.value !== "string") continue;
        const rewritten = column.name.endsWith("_json")
          ? rewriteJsonPaths(row.value, source, destination)
          : rewritePath(row.value, source, destination);
        if (rewritten !== row.value) {
          database
            .prepare(`UPDATE ${table} SET ${field} = ? WHERE rowid = ?`)
            .run(rewritten, row.migration_id ?? null);
        }
      }
    }
  }
}

/** Temporary bridge for one release. A completed profile never reads the legacy directory again. */
export const migrateLegacyDataHome = Effect.fn("migrateLegacyDataHome")(function* (
  destination: string,
) {
  yield* Effect.tryPromise({
    try: async () => {
      // Explicit custom homes and worktree sandboxes must never touch the user's profile.
      if (NodePath.basename(destination) !== ".elysia") return;
      const marker = NodePath.join(destination, ".elysia-legacy-home-v1.complete.json");
      if (await exists(marker)) {
        const completed: unknown = JSON.parse(await NodeFSP.readFile(marker, "utf8"));
        if (
          typeof completed !== "object" ||
          completed === null ||
          !("version" in completed) ||
          completed.version !== 1
        ) {
          throw new Error("Invalid migration completion marker.");
        }
        return;
      }
      // Earlier Elysia releases already used this home. A retained upstream
      // profile must not block an upgrade or replace Elysia's existing chats.
      for (const name of ["statev2.sqlite", "state.sqlite"]) {
        if (await exists(NodePath.join(destination, "userdata", name))) return;
      }
      const source = NodePath.join(NodePath.dirname(destination), ".t3");
      if (!(await exists(source))) return;
      const destinationExists = await exists(destination);
      if (destinationExists) {
        if ((await NodeFSP.realpath(source)) === (await NodeFSP.realpath(destination))) return;
        if (!(await NodeFSP.lstat(destination)).isDirectory())
          throw new Error("The destination is not an independent directory.");
        // Native CLI configuration or a failed launch can create this folder
        // without a desktop profile. Preserve those files, never merge databases.
        if ((await databasePaths(destination)).length)
          throw new Error("The destination contains a separate database; refusing to merge it.");
      }
      if (!(await NodeFSP.lstat(source)).isDirectory()) {
        throw new Error("The previous home is not an independent directory.");
      }
      const lock = `${destination}.migration-lock`;
      await NodeFSP.mkdir(lock);
      let stage: string | undefined;
      try {
        if (!destinationExists && (await exists(destination)))
          throw new Error("The destination appeared during migration.");
        const databases = await databasePaths(source);
        await assertClosed(databases);
        stage = await NodeFSP.mkdtemp(`${destination}.migration-`);
        await NodeFSP.cp(source, stage, {
          recursive: true,
          verbatimSymlinks: true,
          filter: (path) => !/\.sqlite(?:-(?:wal|shm))?$/.test(path),
        });
        for (const sourcePath of databases) {
          const targetPath = NodePath.join(stage, NodePath.relative(source, sourcePath));
          await NodeFSP.mkdir(NodePath.dirname(targetPath), { recursive: true });
          const oldDatabase = new NodeSqlite.DatabaseSync(sourcePath, { readOnly: true });
          try {
            const before = inspectDatabase(oldDatabase);
            await NodeSqlite.backup(oldDatabase, targetPath);
            const newDatabase = new NodeSqlite.DatabaseSync(targetPath);
            try {
              newDatabase.exec("BEGIN IMMEDIATE");
              retargetDatabase(newDatabase, source, destination);
              newDatabase.exec("COMMIT");
              if (JSON.stringify(inspectDatabase(newDatabase)) !== JSON.stringify(before)) {
                throw new Error("The database snapshot did not preserve every table's row count.");
              }
            } finally {
              newDatabase.close();
            }
          } finally {
            oldDatabase.close();
          }
        }
        await assertClosed(databases);
        if (destinationExists) {
          // A conflicting file blocks migration rather than replacing either
          // user's configuration. The two originals remain untouched on failure.
          await copyConfiguration(destination, stage);
        }
        await retargetFiles(stage, source, destination);
        await NodeFSP.writeFile(
          NodePath.join(stage, ".elysia-legacy-home-v1.complete.json"),
          JSON.stringify({ version: 1 }),
          { flag: "wx" },
        );
        const backup = `${destination}.legacy-backup-${NodePath.basename(stage)}`;
        // Keep the original discoverable until the verified profile is published:
        // an interrupted migration must never boot into a new, empty profile.
        if (!destinationExists && (await exists(destination)))
          throw new Error("The destination appeared during migration.");
        if (destinationExists && (await databasePaths(destination)).length)
          throw new Error("The destination acquired a database during migration.");
        const previous = `${destination}.pre-migration-${NodePath.basename(stage)}`;
        if (destinationExists) await NodeFSP.rename(destination, previous);
        try {
          await NodeFSP.rename(stage, destination);
        } catch (error) {
          if (destinationExists) await NodeFSP.rename(previous, destination);
          throw error;
        }
        stage = undefined;
        await NodeFSP.rename(source, backup);
      } finally {
        if (stage !== undefined) await NodeFSP.rm(stage, { recursive: true, force: true });
        await NodeFSP.rmdir(lock);
      }
    },
    catch: (cause) => new LegacyDataMigrationError({ destination, cause }),
  });
});

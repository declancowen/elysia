// @effect-diagnostics preferSchemaOverJson:off -- one-release migration uses a JSON reviver to preserve unknown historical payloads.
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { resolveElysiaMcpToolDefinition } from "@t3tools/shared/elysiaMcpToolPresentation";

const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
const toolFields = new Set(["toolName", "tool_name", "tool", "name", "title"]);
const serverFields = new Set(["server", "serverId", "serverName", "mcpServerName"]);

function renameTool(value: string) {
  const candidate = value
    .replace(/^mcp__t3[-_]?code__/i, "mcp__elysia__")
    .replace(/^(?:mcp[-_]{1,2})?t3[-_ ]?code(?=__|[-_.:/ ]|\s*·)/i, "elysia")
    .replace(
      /(?<=^|[_.:/ ])t3_(?=(?:task|page|thread|project|queue|attachment|worktree|environment|pending_request|preview)_)/g,
      "elysia_",
    );
  return candidate !== value && resolveElysiaMcpToolDefinition(candidate) !== null
    ? candidate
    : value;
}

// One-release bridge. The migrator's ledger commits completion with the changes;
// normal readers and newly injected tool catalogs use only Elysia names.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const tables = yield* sql<{ name: string }>`
    SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      AND sql NOT LIKE 'CREATE VIRTUAL TABLE%' AND sql NOT LIKE '%WITHOUT ROWID%'
  `;
  for (const { name } of tables) {
    const table = identifier(name);
    const columns = yield* sql.unsafe<{ name: string }>(`PRAGMA table_info(${table})`);
    for (const column of columns) {
      if (!column.name.endsWith("_json")) continue;
      const field = identifier(column.name);
      const rows = yield* sql.unsafe<{ migration_id: number; value: string }>(
        `SELECT rowid AS migration_id, ${field} AS value FROM ${table} WHERE instr(lower(${field}), 't3') > 0`,
      );
      for (const row of rows) {
        let changed = false;
        const decoded: unknown = JSON.parse(row.value, (key, value: unknown) => {
          if (typeof value !== "string") return value;
          const renamed = toolFields.has(key)
            ? renameTool(value)
            : serverFields.has(key) && /^t3[-_ ]?code$/i.test(value)
              ? "elysia"
              : value;
          changed ||= renamed !== value;
          return renamed;
        });
        if (changed) {
          yield* sql.unsafe(`UPDATE ${table} SET ${field} = ? WHERE rowid = ?`, [
            JSON.stringify(decoded),
            row.migration_id,
          ]);
        }
      }
    }
  }
});

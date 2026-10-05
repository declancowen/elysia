// @effect-diagnostics preferSchemaOverJson:off -- verifies stored JSON before and after the transitional reviver.
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { runMigrations } from "../Migrations.ts";

it.layer(NodeSqliteClient.layer({ filename: ":memory:" }))(
  "Elysia tool metadata migration",
  (it) => {
    it.effect(
      "migrates stored tool identities once without rewriting chat text or unrelated tools",
      () =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* runMigrations({ toMigrationInclusive: 60 });
          const original = {
            toolName: "mcp__t3-code__t3_task_read",
            serverName: "t3-code",
            text: "Read with t3_task_read. Keep my historical message.",
            nested: {
              toolName: "t3_code.t3_thread_send",
              title: "t3code · delegate_task completed",
            },
            unrelated: { toolName: "mcp__github__t3_task_read" },
          };
          yield* sql`INSERT INTO projection_thread_activities (activity_id, thread_id, tone, kind, summary, payload_json, created_at) VALUES ('activity-1', 'thread-1', 'info', 'tool', 'Old activity', ${JSON.stringify(original)}, '2026-10-05T00:00:00Z')`;
          yield* runMigrations();
          const rows = yield* sql<{
            payload_json: string;
          }>`SELECT payload_json FROM projection_thread_activities`;
          assert.deepEqual(JSON.parse(rows[0]!.payload_json), {
            ...original,
            toolName: "mcp__elysia__elysia_task_read",
            serverName: "elysia",
            nested: {
              toolName: "elysia.elysia_thread_send",
              title: "elysia · delegate_task completed",
            },
          });
          assert.deepEqual(yield* runMigrations(), []);
          assert.deepEqual(yield* sql`SELECT payload_json FROM projection_thread_activities`, rows);
          assert.equal(
            (yield* sql`SELECT count(*) AS count FROM effect_sql_migrations WHERE migration_id = 61`)[0]
              ?.count,
            1,
          );
        }),
    );
  },
);

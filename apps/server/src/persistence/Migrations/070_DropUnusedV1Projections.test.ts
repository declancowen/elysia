import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@elysiatools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";

const layer = it.layer(NodeSqliteClient.layer({ filename: ":memory:" }));

layer("070_DropUnusedV1Projections", (it) => {
  it.effect("drops V1 projections nothing reads and keeps the transcript import sources", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 69 });
      yield* sql`
        INSERT INTO projection_thread_messages
          (message_id, thread_id, role, text, is_streaming, created_at, updated_at)
        VALUES ('message-1', 'thread-1', 'user', 'hello', 0, '2026-01-01', '2026-01-01')
      `;

      yield* sql`INSERT INTO projection_thread_activities
        (activity_id, thread_id, tone, kind, summary, payload_json, created_at)
        VALUES ('delegation-1', 'thread-1', 'info', 'agent.delegated', 'Delegated review', '{}', '2026-01-01')`;

      yield* runMigrations({ toMigrationInclusive: 70 });

      const rows = yield* sql<{ readonly name: string }>`
        SELECT name FROM sqlite_master WHERE type = 'table'
      `;
      const tables = new Set(rows.map((row) => row.name));
      for (const dropped of [
        "projection_thread_proposed_plans",
        "projection_pending_approvals",
        "projection_state",
        "checkpoint_diff_blobs",
      ]) {
        assert.isFalse(tables.has(dropped), dropped);
      }
      for (const kept of [
        "projection_thread_activities",
        "projection_turns",
        "projection_threads",
        "projection_thread_messages",
        "projection_thread_pull_requests",
      ]) {
        assert.isTrue(tables.has(kept), kept);
      }
      assert.deepEqual(yield* sql`SELECT activity_id FROM projection_thread_activities`, [
        { activity_id: "delegation-1" },
      ]);
      assert.deepEqual(yield* sql`SELECT message_id FROM projection_thread_messages`, [
        { message_id: "message-1" },
      ]);
    }),
  );
  it.effect("upgrades the published fork ledger without changing pages or tasks", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 69 });
      yield* sql`
        INSERT INTO pages (id, title, content, project_id, created_at, updated_at, revision, kind, parent_folder_id)
        VALUES ('folder', 'Research', '', 'project-1', '2026-10-01', '2026-10-01', 1, 'folder', NULL),
               ('page', 'Notes', 'Keep this content', 'project-1', '2026-10-01', '2026-10-01', 2, 'page', 'folder')
      `;
      yield* sql`INSERT INTO work_tasks (number, data_json) VALUES (42, '{"title":"Keep this task","projectId":"project-1","threadId":"thread-1"}')`;
      const pagesBefore = yield* sql`SELECT * FROM pages ORDER BY id`;
      const tasksBefore = yield* sql`SELECT * FROM work_tasks ORDER BY number`;
      assert.deepEqual(yield* runMigrations(), [
        [70, "DropUnusedV1Projections"],
        [71, "CanonicalizeThreadPullRequestLinks"],
        [72, "CodexUsageNativeTurnIndex"],
        [73, "RepairClientSettlementTimestamps"],
      ]);
      assert.deepEqual(yield* sql`SELECT * FROM pages ORDER BY id`, pagesBefore);
      assert.deepEqual(yield* sql`SELECT * FROM work_tasks ORDER BY number`, tasksBefore);
      assert.deepEqual(yield* runMigrations(), []);
      assert.deepEqual(yield* sql`SELECT name FROM effect_sql_migrations WHERE migration_id = 61`, [
        { name: "ElysiaToolNames" },
      ]);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );
});

import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

// Keep V1 transcript, delegation and task-result tables for their migration readers.
// Only unused projections are dropped; `elysia doctor` reports their freed pages.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`DROP TABLE IF EXISTS projection_thread_proposed_plans`;
  yield* sql`DROP TABLE IF EXISTS projection_pending_approvals`;
  yield* sql`DROP TABLE IF EXISTS projection_state`;
  yield* sql`DROP TABLE IF EXISTS checkpoint_diff_blobs`;
});

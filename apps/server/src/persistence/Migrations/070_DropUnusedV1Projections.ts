import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * V2 databases start as a copy of the V1 database, and nothing reads these V1
 * projections after the copy. The V1 transcript import still reads threads,
 * messages, pull request links and Elysia delegation activities. Task-result
 * lookup also reads legacy turns, so all of those stay.
 * The freed pages are reported as reclaimable space for `elysia doctor`.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`DROP TABLE IF EXISTS projection_thread_proposed_plans`;
  yield* sql`DROP TABLE IF EXISTS projection_pending_approvals`;
  yield* sql`DROP TABLE IF EXISTS projection_state`;
  yield* sql`DROP TABLE IF EXISTS checkpoint_diff_blobs`;
});

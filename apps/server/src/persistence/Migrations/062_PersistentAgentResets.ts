import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE persistent_agent_resets (
    project_id TEXT PRIMARY KEY, intent_json TEXT NOT NULL,
    memory_cleared INTEGER NOT NULL DEFAULT 0 CHECK(memory_cleared IN (0,1))
  )`;
});

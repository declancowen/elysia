import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE pages (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
    project_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision > 0)
  )`;
});

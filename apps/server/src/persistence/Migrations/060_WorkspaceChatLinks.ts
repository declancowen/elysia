import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE workspace_chat_links (
    kind TEXT NOT NULL CHECK(kind IN ('task','page')), item_id TEXT NOT NULL,
    thread_id TEXT NOT NULL, PRIMARY KEY(kind, item_id, thread_id)
  )`;
  yield* sql`CREATE TRIGGER pages_chat_links_delete AFTER DELETE ON pages BEGIN
    DELETE FROM workspace_chat_links WHERE kind='page' AND item_id=OLD.id; END`;
  yield* sql`CREATE TRIGGER tasks_chat_links_delete AFTER DELETE ON work_tasks BEGIN
    DELETE FROM workspace_chat_links WHERE kind='task' AND item_id='TASK-' || OLD.number; END`;
});

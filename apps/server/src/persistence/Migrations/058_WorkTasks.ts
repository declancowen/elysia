import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE work_tasks (number INTEGER PRIMARY KEY AUTOINCREMENT, data_json TEXT NOT NULL)`;
  yield* sql`CREATE TABLE work_task_starts (task_number INTEGER PRIMARY KEY, command_id TEXT NOT NULL, assignee_project_id TEXT NOT NULL)`;
});

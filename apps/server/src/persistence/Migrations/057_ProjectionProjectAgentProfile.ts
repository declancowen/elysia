import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(projection_projects)`;
  if (!columns.some((column) => column.name === "agent_profile_json")) {
    yield* sql`ALTER TABLE projection_projects ADD COLUMN agent_profile_json TEXT`;
  }
  // Early agent builds had exactly one persistent conversation but no explicit link.
  yield* sql`
    UPDATE projection_projects
    SET agent_profile_json = json_set(agent_profile_json, '$.conversationThreadId', (
      SELECT thread_id FROM projection_threads
      WHERE projection_threads.project_id = projection_projects.project_id AND deleted_at IS NULL
      LIMIT 1
    ))
    WHERE agent_profile_json IS NOT NULL AND json_valid(agent_profile_json)
      AND json_extract(agent_profile_json, '$.conversationThreadId') IS NULL
      AND (SELECT COUNT(*) FROM projection_threads WHERE projection_threads.project_id = projection_projects.project_id AND deleted_at IS NULL) = 1
  `;
});

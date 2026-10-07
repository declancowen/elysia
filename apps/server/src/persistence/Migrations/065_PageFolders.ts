import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE pages ADD COLUMN kind TEXT NOT NULL DEFAULT 'page' CHECK(kind IN ('page', 'folder'))`;
  yield* sql`ALTER TABLE pages ADD COLUMN parent_folder_id TEXT REFERENCES pages(id)`;
  yield* sql`CREATE INDEX pages_parent_folder ON pages(parent_folder_id)`;
});

import {
  WorkspaceChatError,
  type WorkspaceChatTarget,
  type WorkspaceChatLinkInput,
  type ThreadId,
} from "@elysiatools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import * as Threads from "../orchestration-v2/ThreadManagementService.ts";
import * as Projects from "../orchestration-v2/ProjectStore.ts";
export class WorkspaceChatService extends Context.Service<
  WorkspaceChatService,
  {
    readonly list: (
      target: WorkspaceChatTarget,
    ) => Effect.Effect<{ threadIds: ThreadId[] }, WorkspaceChatError>;
    readonly link: (
      input: WorkspaceChatLinkInput,
    ) => Effect.Effect<{ threadIds: ThreadId[] }, WorkspaceChatError>;
  }
>()("@elysiatools/server/workspace/WorkspaceChatService") {}
const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const threads = yield* Threads.ThreadManagementService;
  const projects = yield* Projects.ProjectStoreV2;
  const wrap = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.mapError((cause) =>
        Schema.is(WorkspaceChatError)(cause)
          ? cause
          : new WorkspaceChatError({ message: "Could not access linked chats.", cause }),
      ),
    );
  const exists = (target: WorkspaceChatTarget) =>
    Effect.gen(function* () {
      const rows =
        target.kind === "page"
          ? yield* sql`SELECT id FROM pages WHERE id=${target.id}`
          : yield* sql`SELECT number FROM work_tasks WHERE number=${Number(target.id.slice(5))}`;
      if (!rows.length)
        return yield* new WorkspaceChatError({ message: "The task or page no longer exists." });
    });
  const regular = (id: ThreadId) =>
    Effect.gen(function* () {
      const thread = yield* threads.getThreadShell(id);
      if (
        !thread ||
        thread.deletedAt !== null ||
        thread.archivedAt !== null ||
        thread.lineage.relationshipToParent === "subagent"
      )
        return false;
      const project = yield* projects.get(thread.projectId);
      return (
        Option.isSome(project) && project.value.deletedAt === null && !project.value.agentProfile
      );
    });
  const list = (target: WorkspaceChatTarget) =>
    wrap(
      Effect.gen(function* () {
        yield* exists(target);
        const rows = yield* sql<{
          thread_id: ThreadId;
        }>`SELECT thread_id FROM workspace_chat_links WHERE kind=${target.kind} AND item_id=${target.id} ORDER BY rowid`;
        const threadIds: ThreadId[] = [];
        for (const row of rows) if (yield* regular(row.thread_id)) threadIds.push(row.thread_id);
        return { threadIds };
      }),
    );
  return WorkspaceChatService.of({
    list,
    link: (input) =>
      wrap(
        Effect.gen(function* () {
          yield* exists(input.target);
          if (input.linked) {
            const thread = yield* threads.getThreadShell(input.threadId);
            const draftProject =
              input.draftProjectId && !thread
                ? yield* projects.get(input.draftProjectId)
                : Option.none();
            const reservable =
              Option.isSome(draftProject) &&
              draftProject.value.deletedAt === null &&
              !draftProject.value.agentProfile;
            if (!reservable && !(yield* regular(input.threadId)))
              return yield* new WorkspaceChatError({
                message: "Choose an active regular project chat.",
              });
            if (thread && input.draftProjectId && thread.projectId !== input.draftProjectId)
              return yield* new WorkspaceChatError({
                message: "The chat belongs to another project.",
              });
            yield* sql`INSERT OR IGNORE INTO workspace_chat_links (kind,item_id,thread_id) VALUES (${input.target.kind},${input.target.id},${input.threadId})`;
          } else
            yield* sql`DELETE FROM workspace_chat_links WHERE kind=${input.target.kind} AND item_id=${input.target.id} AND thread_id=${input.threadId}`;
          return yield* list(input.target);
        }).pipe(sql.withTransaction),
      ),
  });
});
export const layer = Layer.effect(WorkspaceChatService, make);

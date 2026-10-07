import { assert, it } from "@effect/vitest";
import {
  EventId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  WorkTaskId,
  PageId,
  type OrchestrationV2DomainEvent,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as Threads from "../orchestration-v2/ThreadManagementService.ts";
import * as Chats from "./WorkspaceChatService.ts";
const threadManagement = Layer.unwrap(
  Effect.map(ProjectionStore.ProjectionStoreV2, (store) =>
    Layer.mock(Threads.ThreadManagementService)({
      getThreadShell: (id) => store.getThreadShell(id).pipe(Effect.orDie),
    }),
  ),
);
const TestLayer = Chats.layer.pipe(
  Layer.provideMerge(threadManagement),
  Layer.provideMerge(Layer.mergeAll(ProjectionStore.layer, ProjectStore.layer)),
  Layer.provideMerge(SqlitePersistence.layerMemory),
);
const providerInstanceId = ProviderInstanceId.make("claudeAgent");
const at = (minute: number) => DateTime.makeUnsafe(Date.UTC(2026, 9, 5, 0, minute));
const createProject = (projectId: ProjectId) =>
  Effect.flatMap(ProjectStore.ProjectStoreV2, (projects) =>
    projects.apply({
      sequence: 0,
      eventId: EventId.make(`created:${projectId}`),
      aggregateKind: "project",
      aggregateId: projectId,
      occurredAt: DateTime.formatIso(at(0)),
      commandId: null,
      causationEventId: null,
      correlationId: null,
      metadata: {},
      type: "project.created",
      payload: {
        projectId,
        title: projectId,
        workspaceRoot: `/work/${projectId}`,
        defaultModelSelection: null,
        scripts: [],
        createdAt: DateTime.formatIso(at(0)),
        updatedAt: DateTime.formatIso(at(0)),
      },
    }),
  );

const thread = (
  threadId: ThreadId,
  projectId: ProjectId,
  overrides: { readonly archivedAt?: DateTime.Utc; readonly deletedAt?: DateTime.Utc } = {},
): Extract<OrchestrationV2DomainEvent, { type: "thread.created" }> => ({
  id: EventId.make(`created:${threadId}`),
  type: "thread.created",
  threadId,
  providerInstanceId,
  occurredAt: at(0),
  payload: {
    createdBy: "user",
    creationSource: "web",
    id: threadId,
    projectId,
    title: threadId,
    providerInstanceId,
    modelSelection: { instanceId: providerInstanceId, model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
    forkedFrom: null,
    createdAt: at(0),
    updatedAt: at(0),
    archivedAt: overrides.archivedAt ?? null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: overrides.deletedAt ?? null,
  },
});

it.layer(TestLayer)("Workspace linked chats", (it) => {
  it.effect.each(["task", "page"] as const)(
    `reserves a %s association before launch and recovers it without a post-launch request`,
    (kind) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const number = kind === "task" ? 98 : 99;
        const projectId = ProjectId.make(`reserved-project:${kind}`);
        const id = ThreadId.make(`reserved-chat:${kind}`);
        const pageId = PageId.make(`page-11111111-1111-1111-1111-1111111111${number}`);
        const target =
          kind === "task" ? { kind, id: WorkTaskId.make(`TASK-${number}`) } : { kind, id: pageId };
        yield* sql`INSERT INTO work_tasks (number,data_json) VALUES (${number},'{}')`;
        yield* sql`INSERT INTO pages (id,title,content,project_id,created_at,updated_at,revision) VALUES (${pageId},'Notes','',NULL,'2026-10-05T00:00:00.000Z','2026-10-05T00:00:00.000Z',1)`;
        yield* createProject(projectId);
        const chats = yield* Chats.WorkspaceChatService;
        assert.isTrue(
          (yield* Effect.result(chats.link({ target, threadId: id, linked: true })))._tag ===
            "Failure",
        );
        assert.isTrue(
          (yield* Effect.result(
            chats.link({
              target,
              threadId: id,
              linked: true,
              draftProjectId: ProjectId.make("missing"),
            }),
          ))._tag === "Failure",
        );
        assert.deepEqual(
          yield* chats.link({ target, threadId: id, linked: true, draftProjectId: projectId }),
          { threadIds: [] },
        );
        assert.lengthOf(
          yield* sql`SELECT * FROM workspace_chat_links WHERE item_id=${target.id}`,
          1,
        );
        // Simulate losing the launch acknowledgement: only the thread becomes durable.
        yield* (yield* ProjectionStore.ProjectionStoreV2).apply(thread(id, projectId));
        const recovered = yield* Effect.flatMap(Chats.WorkspaceChatService, (reopened) =>
          reopened.list(target),
        ).pipe(Effect.provide(Chats.layer));
        assert.deepEqual(recovered.threadIds, [id]);
        assert.isTrue(
          (yield* Effect.result(
            chats.link({
              target,
              threadId: id,
              linked: true,
              draftProjectId: ProjectId.make("other"),
            }),
          ))._tag === "Failure",
        );
      }),
  );
  it.effect(
    "keeps task/page links isolated, deduplicates, unlinks, and excludes unavailable conversations",
    () =>
      Effect.gen(function* () {
        const chats = yield* Chats.WorkspaceChatService;
        const projections = yield* ProjectionStore.ProjectionStoreV2;
        const projects = yield* ProjectStore.ProjectStoreV2;
        const sql = yield* SqlClient.SqlClient;
        const projectId = ProjectId.make("side-chat-project");
        const id = ThreadId.make("side-chat-thread");
        const page = {
          kind: "page" as const,
          id: PageId.make("page-11111111-1111-1111-1111-111111111111"),
        };
        const task = { kind: "task" as const, id: WorkTaskId.make("TASK-1") };
        yield* sql`INSERT INTO work_tasks (number,data_json) VALUES (1,'{}')`;
        yield* sql`INSERT INTO pages (id,title,content,project_id,created_at,updated_at,revision) VALUES (${page.id},'Notes','',NULL,'2026-10-05T00:00:00.000Z','2026-10-05T00:00:00.000Z',1)`;
        yield* createProject(projectId);
        yield* projections.apply(thread(id, projectId));
        assert.deepEqual(
          (yield* chats.link({ target: task, threadId: id, linked: true })).threadIds,
          [id],
        );
        assert.deepEqual(
          (yield* chats.link({ target: task, threadId: id, linked: true })).threadIds,
          [id],
        );
        assert.deepEqual((yield* chats.list(page)).threadIds, []);
        assert.deepEqual(
          (yield* chats.link({ target: page, threadId: id, linked: true })).threadIds,
          [id],
        );
        yield* chats.link({ target: task, threadId: id, linked: false });
        assert.deepEqual((yield* chats.list(task)).threadIds, []);
        assert.deepEqual((yield* chats.list(page)).threadIds, [id]);
        yield* projections.apply(thread(id, projectId, { archivedAt: at(1) }));
        assert.deepEqual((yield* chats.list(page)).threadIds, []);
        assert.match(
          (yield* Effect.flip(chats.link({ target: task, threadId: id, linked: true }))).message,
          /regular project chat/,
        );
        assert.match(
          (yield* Effect.flip(
            chats.link({ target: task, threadId: ThreadId.make("missing"), linked: true }),
          )).message,
          /regular project chat/,
        );
        yield* projections.apply(thread(id, projectId, { deletedAt: at(2) }));
        assert.deepEqual((yield* chats.list(page)).threadIds, []);
        const child = thread(id, projectId);
        yield* projections.apply({
          ...child,
          payload: {
            ...child.payload,
            lineage: {
              parentThreadId: ThreadId.make("parent"),
              relationshipToParent: "subagent",
              rootThreadId: ThreadId.make("parent"),
            },
          },
        });
        assert.deepEqual((yield* chats.list(page)).threadIds, []);
        assert.match(
          (yield* Effect.flip(chats.link({ target: task, threadId: id, linked: true }))).message,
          /regular project chat/,
        );
        yield* projections.apply(thread(id, projectId));
        yield* projects.apply({
          sequence: 1,
          eventId: EventId.make("side-chat-agent"),
          aggregateKind: "project",
          aggregateId: projectId,
          occurredAt: DateTime.formatIso(at(1)),
          commandId: null,
          causationEventId: null,
          correlationId: null,
          metadata: {},
          type: "project.meta-updated",
          payload: {
            projectId,
            agentProfile: {
              instructions: "",
              archived: false,
              notificationsEnabled: false,
              avatar: { preset: "circle", color: "#28B4FF" },
              conversationThreadId: id,
            },
            updatedAt: DateTime.formatIso(at(1)),
          },
        });
        assert.deepEqual((yield* chats.list(page)).threadIds, []);
        assert.match(
          (yield* Effect.flip(chats.link({ target: task, threadId: id, linked: true }))).message,
          /regular project chat/,
        );
        yield* sql`DELETE FROM pages WHERE id=${page.id}`;
        assert.deepEqual(
          yield* sql`SELECT thread_id FROM workspace_chat_links WHERE kind='page' AND item_id=${page.id}`,
          [],
        );
        assert.isNotNull(yield* projections.getThreadShell(id));
        assert.match((yield* Effect.flip(chats.list(page))).message, /no longer exists/);
      }),
  );
});

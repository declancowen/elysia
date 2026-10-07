import { expect, it } from "@effect/vitest";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import {
  ProjectId,
  ThreadId,
  IsoDateTime,
  OrchestrationDispatchCommandError,
  type AgentProfile,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Projects from "../orchestration-v2/ProjectStore.ts";
import * as Threads from "../orchestration-v2/ThreadManagementService.ts";
import * as Delegation from "../orchestration-v2/AgentDelegation.ts";
import * as Scheduler from "../scheduling/Scheduler.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as Tasks from "./TaskService.ts";
import * as Receipts from "../orchestration-v2/CommandReceiptStore.ts";
import { taskPrompt } from "./taskPrompt.ts";
const agentId = ProjectId.make("task-agent");
const channelId = ProjectId.make("task-channel");
const threadId = ThreadId.make("task-agent-thread");
const project = (id: ProjectId, agentProfile: AgentProfile | null) => ({
  projectId: id,
  title: "Test",
  agentProfile,
  workspaceRoot: "/tmp",
  defaultModelSelection: null,
  defaultThreadEnvMode: null,
  autoPull: false,
  faviconPath: null,
  projectIcon: null,
  scripts: [],
  createdAt: IsoDateTime.make("2026-10-05T00:00:00.000Z"),
  updatedAt: IsoDateTime.make("2026-10-05T00:00:00.000Z"),
  deletedAt: null,
});
const profile: AgentProfile = {
  instructions: "",
  archived: false,
  notificationsEnabled: false,
  avatar: { preset: "circle", color: "#28B4FF" },
  conversationThreadId: threadId,
};
it.effect("preserves dates, patches fields, and permanently deletes without reusing IDs", () =>
  Effect.gen(function* () {
    const deps = Layer.mergeAll(
      NodeCrypto.layer,
      Scheduler.layer,
      Projects.layer,
      Layer.mock(Threads.ThreadManagementService)({}),
      Layer.mock(Delegation.AgentDelegation)({}),
    );
    yield* Effect.gen(function* () {
      const tasks = yield* Tasks.TaskService;
      const task = (yield* tasks.save({ title: "Review", description: "Keep this context" })).task;
      expect(task.id).toBe("TASK-1");
      yield* TestClock.adjust("1 second");
      const done = (yield* tasks.save({ id: task.id, status: "done" })).task;
      expect(done.createdAt).toBe(task.createdAt);
      expect(done.updatedAt).not.toBe(task.updatedAt);
      expect(done.completedAt).toBe(done.updatedAt);
      expect(done.description).toBe(task.description);
      expect(done.revision).toBe(task.revision + 1);
      expect(
        (yield* Effect.flip(
          tasks.save({ id: task.id, expectedRevision: task.revision, title: "Stale" }),
        )).message,
      ).toContain("newer edits");
      expect((yield* tasks.save({ id: task.id, status: "todo" })).task.completedAt).toBe(null);
      let received = 0;
      const snapshots = yield* tasks.subscribeList().pipe(
        Stream.mapEffect((snapshot) =>
          Effect.gen(function* () {
            if (received++ === 0)
              yield* tasks.save({ id: task.id, title: "Updated while subscribing" });
            return snapshot;
          }),
        ),
        Stream.take(2),
        Stream.runCollect,
      );
      expect(snapshots[1]?.tasks[0]?.title).toBe("Updated while subscribing");
      const full = (yield* tasks.save({ id: task.id, description: "a".repeat(600) })).task;
      expect((yield* tasks.list()).tasks[0]?.descriptionPreview).toHaveLength(512);
      expect((yield* tasks.get({ id: task.id })).task.description).toBe(full.description);
      yield* tasks.delete({ id: task.id });
      expect((yield* tasks.list()).tasks).toEqual([]);
      expect((yield* Effect.flip(tasks.save({ id: task.id, title: "Resurrect" }))).message).toBe(
        "Task not found.",
      );
      expect((yield* tasks.save({ title: "New" })).task.id).toBe("TASK-2");
    }).pipe(Effect.provide(Tasks.layer.pipe(Layer.provide(deps))));
  }).pipe(Effect.provide(SqlitePersistenceMemory)),
);
it.effect(
  "starts assigned conversations exactly once on entry and keeps channel work in the channel",
  () =>
    Effect.gen(function* () {
      const sends = yield* Ref.make(0);
      const channelSends = yield* Ref.make(0);
      const prompts = yield* Ref.make<string[]>([]);
      const deps = Layer.mergeAll(
        NodeCrypto.layer,
        Scheduler.layer,
        Layer.mock(Projects.ProjectStoreV2)({
          get: (id) =>
            Effect.succeed(
              Option.some(
                project(
                  id,
                  id === channelId
                    ? {
                        ...profile,
                        conversationThreadId: ThreadId.make("channel-thread"),
                        group: {
                          memberProjectIds: [agentId, ProjectId.make("task-other-agent")],
                          leadProjectId: agentId,
                        },
                      }
                    : profile,
                ),
              ),
            ),
        }),
        Layer.mock(Threads.ThreadManagementService)({
          sendToThread: (input) =>
            Ref.update(sends, (n) => n + 1).pipe(
              Effect.andThen(Ref.update(prompts, (texts) => [...texts, input.text])),
              Effect.andThen(
                Effect.fail(
                  new Threads.ThreadManagementThreadNotFoundError({
                    projectId: agentId,
                    threadId: input.threadId,
                  }),
                ),
              ),
            ),
        }),
        Layer.mock(Delegation.AgentDelegation)({
          delegate: (input) =>
            Effect.sync(() => {
              expect(input.sourceThreadId).toBe("channel-thread");
              expect(input.agentProjectId).toBe(agentId);
            }).pipe(
              Effect.andThen(Ref.update(prompts, (texts) => [...texts, input.text])),
              Effect.andThen(Ref.update(channelSends, (n) => n + 1)),
              Effect.andThen(
                Effect.fail(
                  new OrchestrationDispatchCommandError({
                    message:
                      input.sourceThreadId === "channel-thread"
                        ? "Provider unavailable"
                        : "Wrong channel",
                  }),
                ),
              ),
            ),
        }),
      );
      yield* Effect.gen(function* () {
        const tasks = yield* Tasks.TaskService;
        const task = (yield* tasks.save({
          title: "Build",
          description: "<p>Build &amp; review.</p>",
          assigneeProjectId: agentId,
          status: "in_progress",
        })).task;
        expect(task.startError).not.toBe(null);
        expect(yield* Ref.get(sends)).toBe(1);
        expect((yield* Ref.get(prompts))[0]).toBe(taskPrompt(task));
        expect(task.description).toBe("<p>Build &amp; review.</p>");
        expect((yield* tasks.save({ id: task.id, title: "Build it" })).task.startError).toBe(
          task.startError,
        );
        expect(yield* Ref.get(sends)).toBe(1);
        yield* tasks.save({ id: task.id, status: "todo" });
        yield* tasks.save({ id: task.id, status: "in_progress" });
        expect(yield* Ref.get(sends)).toBe(2);
        yield* tasks.save({
          title: "Discuss",
          description: "<p>Discuss the result.</p>",
          assigneeProjectId: channelId,
          status: "in_progress",
        });
        expect(yield* Ref.get(channelSends)).toBe(1);
        expect(yield* Ref.get(sends)).toBe(2);
        expect((yield* Ref.get(prompts)).at(-1)).toContain(
          "Discuss the result.\n\nRead this task in Elysia",
        );
        const sql = yield* SqlClient.SqlClient;
        expect(yield* sql`SELECT * FROM work_task_starts`).toEqual([]);
      }).pipe(Effect.provide(Tasks.layer.pipe(Layer.provide(deps))));
    }).pipe(Effect.provide(SqlitePersistenceMemory)),
);

it.effect(
  "retains uncertain starts, replays the same command, and reconciles acceptance after a failed projection read",
  () =>
    Effect.gen(function* () {
      const receipts = yield* Receipts.CommandReceiptStoreV2;
      const sql = yield* SqlClient.SqlClient;
      const commands: string[] = [];
      const deps = Layer.mergeAll(
        NodeCrypto.layer,
        Scheduler.layer,
        Layer.mock(Projects.ProjectStoreV2)({
          get: (id) => Effect.succeed(Option.some(project(id, profile))),
        }),
        Layer.mock(Delegation.AgentDelegation)({}),
        Layer.mock(Threads.ThreadManagementService)({
          sendToThread: (input) =>
            Effect.gen(function* () {
              commands.push(input.commandId);
              if (commands.length > 1)
                yield* receipts
                  .upsert({
                    commandId: input.commandId,
                    threadId,
                    commandType: "message.dispatch",
                    acceptedAt: DateTime.makeUnsafe("2026-10-05T00:00:00.000Z"),
                    resultSequence: 1,
                    status: "accepted",
                    error: null,
                  })
                  .pipe(Effect.orDie);
              return yield* new Threads.ThreadManagementDurableRunProjectionError({
                threadId,
                messageId: input.messageId,
              });
            }),
        }),
      );
      yield* Effect.gen(function* () {
        const tasks = yield* Tasks.TaskService;
        const task = (yield* tasks.save({
          title: "Build",
          assigneeProjectId: agentId,
          status: "in_progress",
        })).task;
        expect(task.startError).toContain("retry safely");
        expect(yield* sql`SELECT * FROM work_task_starts`).toHaveLength(1);
        expect((yield* Effect.flip(tasks.save({ id: task.id, status: "todo" }))).message).toContain(
          "still being confirmed",
        );
        const resolved = (yield* tasks.save({ id: task.id, title: "Build safely" })).task;
        expect(commands).toHaveLength(2);
        expect(commands[0]).toBe(commands[1]);
        expect(resolved.startedThreadId).toBe(threadId);
        expect(resolved.startError).toBeNull();
        expect(yield* sql`SELECT * FROM work_task_starts`).toEqual([]);
        // The same durable row can survive a crash after dispatch and before cleanup.
        yield* sql`INSERT INTO work_task_starts VALUES (1,${commands[0]},${agentId})`;
        yield* tasks.save({ id: task.id, title: "Recovered" });
        expect(commands).toHaveLength(2);
        expect(yield* sql`SELECT * FROM work_task_starts`).toEqual([]);
      }).pipe(Effect.provide(Tasks.layer.pipe(Layer.provide(deps))));
    }).pipe(Effect.provide(Receipts.layer.pipe(Layer.provideMerge(SqlitePersistenceMemory)))),
);

it.effect("validates parent links and promotes children when a parent is deleted", () =>
  Effect.gen(function* () {
    const deps = Layer.mergeAll(
      NodeCrypto.layer,
      Scheduler.layer,
      Projects.layer,
      Layer.mock(Threads.ThreadManagementService)({}),
      Layer.mock(Delegation.AgentDelegation)({}),
    );
    yield* Effect.gen(function* () {
      const tasks = yield* Tasks.TaskService;
      const parent = (yield* tasks.save({ title: "Parent" })).task;
      const child = (yield* tasks.save({ title: "Child", parentTaskId: parent.id })).task;
      expect((yield* tasks.get({ id: child.id })).task.parentTaskId).toBe(parent.id);
      expect(
        (yield* Effect.flip(tasks.save({ id: parent.id, parentTaskId: child.id }))).message,
      ).toBe("Subtasks can only have one level.");
      expect(
        (yield* Effect.flip(tasks.save({ title: "Grandchild", parentTaskId: child.id }))).message,
      ).toBe("Subtasks can only have one level.");
      const other = (yield* tasks.save({ title: "Other parent" })).task;
      expect(
        (yield* Effect.flip(tasks.save({ id: parent.id, parentTaskId: other.id }))).message,
      ).toBe("Subtasks can only have one level.");
      yield* tasks.delete({ id: other.id });
      expect(
        (yield* Effect.flip(tasks.save({ id: child.id, parentTaskId: child.id }))).message,
      ).toBe("A task cannot be its own ancestor.");
      yield* tasks.delete({ id: parent.id });
      expect((yield* tasks.get({ id: child.id })).task.parentTaskId).toBe(null);
      expect((yield* tasks.list()).tasks.map((task) => task.id)).toEqual([child.id]);
      expect(
        (yield* Effect.flip(tasks.save({ title: "Invalid", parentTaskId: parent.id }))).message,
      ).toBe("Task not found.");
      expect((yield* tasks.list()).tasks).toHaveLength(1);
    }).pipe(Effect.provide(Tasks.layer.pipe(Layer.provide(deps))));
  }).pipe(Effect.provide(SqlitePersistenceMemory)),
);

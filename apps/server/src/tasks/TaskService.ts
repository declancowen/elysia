import {
  CommandId,
  MessageId,
  WorkTask,
  WorkTaskError,
  type WorkTaskListResult,
  type WorkTaskLookupInput,
  type WorkTaskSaveInput,
  type WorkTaskMutationResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as AgentDelegation from "../orchestration-v2/AgentDelegation.ts";
import * as Scheduler from "../scheduling/Scheduler.ts";
import * as CommandReceipts from "../orchestration-v2/CommandReceiptStore.ts";
import { taskPrompt } from "./taskPrompt.ts";

export class TaskService extends Context.Service<
  TaskService,
  {
    readonly list: () => Effect.Effect<WorkTaskListResult, WorkTaskError>;
    readonly subscribeList: () => Stream.Stream<WorkTaskListResult, WorkTaskError>;
    readonly get: (
      input: WorkTaskLookupInput,
    ) => Effect.Effect<WorkTaskMutationResult, WorkTaskError>;
    readonly save: (
      input: WorkTaskSaveInput,
    ) => Effect.Effect<WorkTaskMutationResult, WorkTaskError>;
    readonly delete: (
      input: WorkTaskLookupInput,
    ) => Effect.Effect<WorkTaskLookupInput, WorkTaskError>;
  }
>()("t3/tasks/TaskService") {}
const fail = (message: string, cause?: unknown) =>
  new WorkTaskError({ message, ...(cause === undefined ? {} : { cause }) });
const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(WorkTask));
const decodeTask = Schema.decodeUnknownEffect(WorkTask);
const isTaskError = Schema.is(WorkTaskError);
const numberOf = (id: WorkTaskLookupInput["id"]) => Number(id.slice(5));

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const crypto = yield* Crypto.Crypto;
  const projects = yield* ProjectStore.ProjectStoreV2;
  const threads = yield* ThreadManagement.ThreadManagementService;
  const delegation = yield* AgentDelegation.AgentDelegation;
  const scheduler = yield* Scheduler.Scheduler;
  const receipts = yield* CommandReceipts.CommandReceiptStoreV2;
  const changes = yield* PubSub.sliding<void>(1);
  // ponytail: serialize local task writes and starts; split start dispatch from writes if throughput matters.
  const lock = yield* Semaphore.make(1);
  const notify = PubSub.publish(changes, undefined).pipe(Effect.asVoid);
  const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));
  const wrap = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, WorkTaskError, R> =>
    effect.pipe(
      Effect.mapError((cause) =>
        isTaskError(cause) ? cause : fail("Could not update tasks.", cause),
      ),
    );
  const read = (number: number) =>
    Effect.gen(function* () {
      const rows = yield* sql<{
        data_json: string;
      }>`SELECT data_json FROM work_tasks WHERE number = ${number}`;
      if (!rows[0]) return yield* fail("Task not found.");
      return yield* decode(rows[0].data_json);
    });
  const write = (task: WorkTask) =>
    sql`UPDATE work_tasks SET data_json = ${JSON.stringify(task)} WHERE number = ${numberOf(task.id)}`;
  const list = () =>
    wrap(
      Effect.gen(function* () {
        const rows = yield* sql<{
          data_json: string;
        }>`SELECT data_json FROM work_tasks ORDER BY number DESC`;
        return {
          tasks: yield* Effect.forEach(rows, (row) =>
            decode(row.data_json).pipe(
              Effect.map(({ description, ...task }) => ({
                ...task,
                descriptionPreview: description.slice(0, 512),
              })),
            ),
          ),
        };
      }),
    );
  const validateLinks = (task: WorkTask, previous: WorkTask | null) =>
    Effect.gen(function* () {
      if (task.parentTaskId && task.parentTaskId !== previous?.parentTaskId) {
        if (task.parentTaskId === task.id) return yield* fail("A task cannot be its own ancestor.");
        const parent = yield* read(numberOf(task.parentTaskId));
        const children =
          yield* sql`SELECT number FROM work_tasks WHERE json_extract(data_json, '$.parentTaskId') = ${task.id} LIMIT 1`;
        if (parent.parentTaskId || children.length)
          return yield* fail("Subtasks can only have one level.");
      }
      if (task.projectId && task.projectId !== previous?.projectId) {
        const project = yield* projects.get(task.projectId);
        if (
          Option.isNone(project) ||
          project.value.deletedAt !== null ||
          project.value.agentProfile
        )
          return yield* fail("Choose an existing workspace project.");
      }
      if (task.assigneeProjectId && task.assigneeProjectId !== previous?.assigneeProjectId) {
        const agent = yield* projects.get(task.assigneeProjectId);
        if (
          Option.isNone(agent) ||
          agent.value.deletedAt !== null ||
          !agent.value.agentProfile ||
          agent.value.agentProfile.archived
        )
          return yield* fail("Choose an active agent or channel.");
      }
    });
  // Durable starts reuse orchestration command IDs, so a restart cannot start the same transition twice.
  const drainStarts = () =>
    wrap(
      lock.withPermit(
        Effect.gen(function* () {
          const pending = yield* sql<{
            task_number: number;
            command_id: string;
            assignee_project_id: string;
          }>`SELECT * FROM work_task_starts ORDER BY task_number`;
          for (const pendingStart of pending) {
            const task = yield* read(pendingStart.task_number);
            const commandId = CommandId.make(pendingStart.command_id);
            const receipt = yield* receipts.getByCommandId(commandId);
            if (
              task.status !== "in_progress" ||
              task.assigneeProjectId !== pendingStart.assignee_project_id
            ) {
              yield* sql`DELETE FROM work_task_starts WHERE task_number = ${pendingStart.task_number}`;
              continue;
            }
            const result =
              Option.isSome(receipt) && receipt.value.status === "accepted"
                ? { _tag: "Success" as const, success: receipt.value.threadId }
                : yield* Effect.result(
                    Effect.gen(function* () {
                      if (Option.isSome(receipt))
                        return yield* fail("The task start was rejected.");
                      const assigned = yield* projects.get(task.assigneeProjectId!);
                      if (
                        Option.isNone(assigned) ||
                        assigned.value.deletedAt !== null ||
                        !assigned.value.agentProfile ||
                        assigned.value.agentProfile.archived
                      )
                        return yield* fail("The assigned agent or channel is unavailable.");
                      const profile = assigned.value.agentProfile;
                      if (!profile.conversationThreadId)
                        return yield* fail("The assigned conversation is unavailable.");
                      const threadId = profile.conversationThreadId;
                      const text = taskPrompt(task);
                      const messageId = MessageId.make(`${pendingStart.command_id}:message`);
                      if (profile.group) {
                        yield* delegation.delegate({
                          commandId,
                          messageId,
                          sourceThreadId: threadId,
                          agentProjectId: profile.group.leadProjectId,
                          text,
                          attachments: [],
                        });
                      } else {
                        yield* threads.sendToThread({
                          projectId: assigned.value.projectId,
                          threadId,
                          commandId,
                          messageId,
                          text,
                          attachments: [],
                          mode: "queue",
                          createdBy: "user",
                          creationSource: "mcp",
                        });
                      }
                      return threadId;
                    }),
                  );
            // A dispatch can commit before its projection read fails. Only a durable
            // receipt or a known pre-dispatch rejection resolves that uncertainty.
            const settledReceipt =
              result._tag === "Success" ? receipt : yield* receipts.getByCommandId(commandId);
            const accepted =
              Option.isSome(settledReceipt) && settledReceipt.value.status === "accepted"
                ? settledReceipt.value.threadId
                : result._tag === "Success"
                  ? result.success
                  : null;
            const rejected =
              Option.isSome(settledReceipt) && settledReceipt.value.status === "rejected";
            const knownFailure =
              result._tag === "Failure" &&
              (isTaskError(result.failure) ||
                result.failure._tag === "ThreadManagementThreadNotFoundError" ||
                result.failure._tag === "ThreadManagementThreadArchivedError" ||
                // Channel admission rejects without a cause; dispatch/read failures wrap one.
                (result.failure._tag === "OrchestrationDispatchCommandError" &&
                  result.failure.cause === undefined));
            const resolved = accepted !== null || rejected || knownFailure;
            if (!resolved)
              yield* Effect.logWarning(
                "Task start acceptance is unresolved; retaining its command",
                {
                  taskId: task.id,
                  commandId,
                  error: result._tag === "Failure" ? result.failure : undefined,
                },
              );
            const changed = yield* sql.withTransaction(
              Effect.gen(function* () {
                const current = yield* read(pendingStart.task_number);
                const next =
                  accepted !== null
                    ? { ...current, startedThreadId: accepted, startError: null }
                    : {
                        ...current,
                        startError: resolved
                          ? "Could not start the assigned conversation. Move the task out of In progress and back to retry."
                          : "Confirming whether the assigned conversation started. Elysia will retry safely; do not start it again.",
                      };
                const changed =
                  next.startError !== current.startError ||
                  next.startedThreadId !== current.startedThreadId;
                if (changed) yield* write({ ...next, revision: current.revision + 1 });
                if (resolved)
                  yield* sql`DELETE FROM work_task_starts WHERE task_number = ${pendingStart.task_number} AND command_id = ${pendingStart.command_id}`;
                return changed;
              }),
            );
            if (changed) yield* notify;
          }
        }),
      ),
    );
  const save = (input: WorkTaskSaveInput) =>
    wrap(
      Effect.gen(function* () {
        const task = yield* lock.withPermit(
          sql.withTransaction(
            Effect.gen(function* () {
              const timestamp = yield* now;
              const previous = input.id ? yield* read(numberOf(input.id)) : null;
              if (
                previous &&
                input.expectedRevision !== undefined &&
                input.expectedRevision !== previous.revision
              )
                return yield* fail(
                  "This task has newer edits. Your draft has been preserved; reload the latest task before retrying.",
                );
              if (
                previous &&
                ((input.status !== undefined && input.status !== previous.status) ||
                  (input.assigneeProjectId !== undefined &&
                    input.assigneeProjectId !== previous.assigneeProjectId))
              ) {
                const pending =
                  yield* sql`SELECT 1 FROM work_task_starts WHERE task_number = ${numberOf(previous.id)}`;
                if (pending.length)
                  return yield* fail(
                    "The previous task start is still being confirmed. Wait before changing its status or assigned agent.",
                  );
              }
              let number = previous ? numberOf(previous.id) : 0;
              if (!previous) {
                if (!input.title) return yield* fail("A task title is required.");
                const inserted = yield* sql<{
                  number: number;
                }>`INSERT INTO work_tasks (data_json) VALUES ('{}') RETURNING number`;
                number = inserted[0]!.number;
              }
              const task = yield* decodeTask({
                id: `TASK-${number}`,
                title: input.title ?? previous?.title,
                revision: previous ? previous.revision + 1 : 1,
                description: input.description ?? previous?.description ?? "",
                status: input.status ?? previous?.status ?? "todo",
                parentTaskId:
                  input.parentTaskId === undefined
                    ? (previous?.parentTaskId ?? null)
                    : input.parentTaskId,
                projectId:
                  input.projectId === undefined ? (previous?.projectId ?? null) : input.projectId,
                assigneeProjectId:
                  input.assigneeProjectId === undefined
                    ? (previous?.assigneeProjectId ?? null)
                    : input.assigneeProjectId,
                createdAt: previous?.createdAt ?? timestamp,
                updatedAt: timestamp,
                completedAt:
                  (input.status ?? previous?.status) === "done"
                    ? (previous?.completedAt ?? timestamp)
                    : null,
                startedThreadId: previous?.startedThreadId ?? null,
                startError:
                  (input.status ?? previous?.status) === "in_progress" &&
                  (input.assigneeProjectId === undefined ||
                    input.assigneeProjectId === previous?.assigneeProjectId)
                    ? (previous?.startError ?? null)
                    : null,
              });
              yield* validateLinks(task, previous);
              yield* write(task);
              if (
                task.status === "in_progress" &&
                task.assigneeProjectId &&
                (previous?.status !== "in_progress" ||
                  previous.assigneeProjectId !== task.assigneeProjectId)
              ) {
                const commandId = `work-task:${task.id}:${yield* crypto.randomUUIDv4}`;
                yield* sql`INSERT INTO work_task_starts VALUES (${number}, ${commandId}, ${task.assigneeProjectId}) ON CONFLICT(task_number) DO UPDATE SET command_id = excluded.command_id, assignee_project_id = excluded.assignee_project_id`;
              }
              return task;
            }),
          ),
        );
        yield* notify;
        yield* drainStarts();
        return { task: yield* read(numberOf(task.id)) };
      }),
    );
  yield* scheduler.register(
    "work-task-starts",
    drainStarts().pipe(
      Effect.catch((error) => Effect.logWarning("Could not start assigned task", { error })),
    ),
  );
  return TaskService.of({
    list,
    subscribeList: () =>
      Stream.unwrap(
        Effect.gen(function* () {
          const subscription = yield* PubSub.subscribe(changes);
          return Stream.concat(
            Stream.fromEffect(list()),
            Stream.fromSubscription(subscription).pipe(Stream.mapEffect(list)),
          );
        }),
      ),
    get: (input) => wrap(read(numberOf(input.id)).pipe(Effect.map((task) => ({ task })))),
    save,
    delete: (input) =>
      wrap(
        lock
          .withPermit(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* read(numberOf(input.id));
                const timestamp = yield* now;
                const { tasks } = yield* list();
                for (const child of tasks.filter((task) => task.parentTaskId === input.id)) {
                  yield* write({
                    ...(yield* read(numberOf(child.id))),
                    parentTaskId: null,
                    revision: child.revision + 1,
                    updatedAt: timestamp,
                  });
                }
                yield* sql`DELETE FROM work_task_starts WHERE task_number = ${numberOf(input.id)}`;
                yield* sql`DELETE FROM work_tasks WHERE number = ${numberOf(input.id)}`;
                return input;
              }),
            ),
          )
          .pipe(Effect.tap(() => notify)),
      ),
  });
});
export const layer = Layer.effect(TaskService, make).pipe(Layer.provide(CommandReceipts.layer));

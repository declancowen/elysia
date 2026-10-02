import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import {
  ChatAttachmentId,
  type AgentDelegateInput,
  CommandId,
  EventId,
  MessageId,
  OrchestrationV2AppThread,
  OrchestrationV2Run,
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { createPendingAttachmentId, resolveAttachmentPath } from "../attachmentStore.ts";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ServerConfig } from "../config.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import {
  AgentDelegation,
  delegateToPersistentAgent,
  getAgentDelegation,
  layer as delegationLayer,
} from "./AgentDelegation.ts";
import * as CommandReceiptStore from "./CommandReceiptStore.ts";
import * as EffectOutbox from "./EffectOutbox.ts";
import * as EventSink from "./EventSink.ts";
import * as EventStore from "./EventStore.ts";
import * as ProjectStore from "./ProjectStore.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ThreadCommandExecutor from "./ThreadCommandExecutor.ts";
import * as ThreadManagement from "./ThreadManagementService.ts";
import * as TurnItemPositionStore from "./TurnItemPositionStore.ts";

const decodeRun = Schema.decodeUnknownEffect(OrchestrationV2Run);
const decodeThread = Schema.decodeUnknownEffect(OrchestrationV2AppThread);
const sourceId = ThreadId.make("source");
const agentId = ProjectId.make("agent");
const agentThreadId = ThreadId.make("agent-chat");
const at = DateTime.makeUnsafe("2026-10-02T00:00:00Z");
const modelSelection = { instanceId: ProviderInstanceId.make("elysia"), model: "native-model" };
const stores = Layer.mergeAll(
  ProjectStore.layer,
  ProjectionStore.layer,
  EventStore.layer,
  CommandReceiptStore.layer,
  EffectOutbox.layer,
  TurnItemPositionStore.layer,
).pipe(Layer.provideMerge(SqlitePersistenceMemory));
const sink = EventSink.layerFromStores.pipe(Layer.provideMerge(stores));
const threads = Layer.unwrap(
  Effect.gen(function* () {
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    const events = yield* EventSink.EventSinkV2;
    return Layer.mock(ThreadManagement.ThreadManagementService)({
      getThreadShell: (id) => projections.getThreadShell(id).pipe(Effect.orDie),
      ensureLegacyTranscript: () => Effect.void,
      dispatch: (command) =>
        Effect.gen(function* () {
          if (command.type !== "message.dispatch")
            return yield* Effect.die("Unexpected dispatcher command");
          assert.equal(command.dispatchMode.type, "queue_after_active");
          const runId = RunId.make(`run-${command.messageId}`);
          const run = yield* decodeRun({
            id: runId,
            threadId: command.threadId,
            ordinal: 1,
            providerInstanceId: modelSelection.instanceId,
            modelSelection,
            providerThreadId: null,
            userMessageId: command.messageId,
            rootNodeId: null,
            activeAttemptId: null,
            status: "queued",
            requestedAt: at,
            startedAt: null,
            completedAt: null,
            checkpointId: null,
            contextHandoffId: null,
          }).pipe(Effect.orDie);
          const committed = yield* events
            .commitCommand({
              commandId: command.commandId,
              threadId: command.threadId,
              commandType: command.type,
              acceptedAt: at,
              effects: [],
              events: [
                {
                  id: EventId.make(`${command.messageId}:run`),
                  type: "run.updated",
                  threadId: command.threadId,
                  occurredAt: at,
                  payload: run,
                },
                {
                  id: EventId.make(`${command.messageId}:message`),
                  type: "message.updated",
                  threadId: command.threadId,
                  occurredAt: at,
                  payload: {
                    id: command.messageId,
                    threadId: command.threadId,
                    runId,
                    nodeId: null,
                    role: "user",
                    text: command.text,
                    attachments: command.attachments,
                    ...(command.context ? { context: command.context } : {}),
                    createdBy: command.createdBy,
                    creationSource: command.creationSource,
                    senderThreadId: sourceId,
                    streaming: false,
                    createdAt: at,
                    updatedAt: at,
                  },
                },
              ],
            })
            .pipe(Effect.orDie);
          return {
            sequence: committed.receipt.resultSequence,
            storedEvents: committed.storedEvents,
          };
        }),
    });
  }),
).pipe(Layer.provide(sink));
const dependencies = Layer.mergeAll(
  sink,
  threads,
  ThreadCommandExecutor.layer,
  ServerConfig.layerTest(process.cwd(), { prefix: "elysia-agent-delegation-v2-" }),
).pipe(Layer.provideMerge(NodeServices.layer));

const testLayer = delegationLayer.pipe(Layer.provideMerge(dependencies));

describe("V2 persistent delegation", () => {
  for (const scenario of [
    "complete",
    "archive",
    "new-work",
    "attachments",
    "source-admission-race",
    "existing-request-race",
  ] as const)
    it.effect(`returns original results durably; source state ${scenario}`, () =>
      Effect.gen(function* () {
        const projects = yield* ProjectStore.ProjectStoreV2;
        const events = yield* EventSink.EventSinkV2;
        const projections = yield* ProjectionStore.ProjectionStoreV2;
        yield* projects.apply({
          sequence: 1,
          eventId: EventId.make("project-agent"),
          aggregateKind: "project",
          aggregateId: agentId,
          occurredAt: DateTime.formatIso(at),
          commandId: null,
          causationEventId: null,
          correlationId: null,
          metadata: {},
          type: "project.created",
          payload: {
            projectId: agentId,
            title: "Alex",
            workspaceRoot: "/tmp/agent-alex",
            defaultModelSelection: modelSelection,
            scripts: [],
            agentProfile: {
              instructions: "Help",
              avatar: { preset: "brain", color: "blue" },
              archived: false,
              notificationsEnabled: true,
              conversationThreadId: agentThreadId,
            },
            createdAt: DateTime.formatIso(at),
            updatedAt: DateTime.formatIso(at),
          },
        });
        yield* projects.apply({
          sequence: 2,
          eventId: EventId.make("source-project-created"),
          aggregateKind: "project",
          aggregateId: ProjectId.make("source-project"),
          occurredAt: DateTime.formatIso(at),
          commandId: null,
          causationEventId: null,
          correlationId: null,
          metadata: {},
          type: "project.created",
          payload: {
            projectId: ProjectId.make("source-project"),
            title: "Source",
            workspaceRoot: "/tmp/source",
            defaultModelSelection: modelSelection,
            scripts: [],
            createdAt: DateTime.formatIso(at),
            updatedAt: DateTime.formatIso(at),
          },
        });
        for (const id of [sourceId, agentThreadId]) {
          const thread = yield* decodeThread({
            id,
            projectId: id === agentThreadId ? agentId : "source-project",
            title: String(id),
            providerInstanceId: modelSelection.instanceId,
            modelSelection,
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            activeProviderThreadId: null,
            lineage: { rootThreadId: id, parentThreadId: null, relationshipToParent: null },
            forkedFrom: null,
            createdAt: at,
            updatedAt: at,
            archivedAt: null,
            deletedAt: null,
            createdBy: "user",
            creationSource: "web",
          });
          yield* events.write({
            events: [
              {
                id: EventId.make(`${id}:created`),
                type: "thread.created",
                threadId: id,
                occurredAt: at,
                payload: thread,
              },
            ],
          });
        }
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const config = yield* ServerConfig;
        let copyCount = 0;
        const retryFs = FileSystem.FileSystem.of({
          ...fs,
          copyFile: (from, to) => {
            copyCount += 1;
            return fs.copyFile(
              from,
              copyCount === 2 ? path.join(to, "cannot-exist", "failure") : to,
            );
          },
        });
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const originalDispatcher = yield* ThreadManagement.ThreadManagementService;
        const gatedDispatcher = ThreadManagement.ThreadManagementService.of({
          ...originalDispatcher,
          dispatch: (command) =>
            scenario === "source-admission-race" &&
            command.type === "message.dispatch" &&
            command.threadId === agentThreadId
              ? Deferred.succeed(entered, undefined).pipe(
                  Effect.andThen(Deferred.await(release)),
                  Effect.andThen(originalDispatcher.dispatch(command)),
                )
              : originalDispatcher.dispatch(command),
        });
        const delegate = (input: AgentDelegateInput) =>
          delegateToPersistentAgent(input).pipe(
            Effect.provide(
              Layer.fresh(delegationLayer).pipe(
                Layer.provide(
                  Layer.merge(
                    Layer.succeed(FileSystem.FileSystem, retryFs),
                    Layer.succeed(ThreadManagement.ThreadManagementService, gatedDispatcher),
                  ),
                ),
              ),
            ),
          );
        const pendingId = ChatAttachmentId.make(createPendingAttachmentId("txt"));
        if (scenario === "attachments")
          yield* fs.writeFileString(
            path.join(config.attachmentsDir, `${pendingId}.txt`),
            "Original attachment",
          );
        const input: AgentDelegateInput = {
          commandId: CommandId.make("delegate"),
          sourceThreadId: sourceId,
          agentProjectId: agentId,
          messageId: MessageId.make("ask"),
          text: "Review this.",
          ...(scenario === "attachments"
            ? {
                attachments: [
                  {
                    type: "file",
                    id: pendingId,
                    name: "notes.txt",
                    mimeType: "text/plain",
                    sizeBytes: 19,
                  },
                ] as const,
              }
            : {}),
        };
        if (scenario === "attachments") {
          yield* delegate(input).pipe(Effect.flip);
          assert.lengthOf(yield* fs.readDirectory(config.attachmentsDir), 1);
        }
        let first;
        let originalSourceItemOrdinal = 0;
        if (scenario === "source-admission-race" || scenario === "existing-request-race") {
          const initial = yield* decodeRun({
            id: RunId.make("source-existing-run"),
            threadId: sourceId,
            ordinal: 1,
            providerInstanceId: modelSelection.instanceId,
            modelSelection,
            providerThreadId: null,
            userMessageId: MessageId.make("prior-ask"),
            rootNodeId: null,
            activeAttemptId: null,
            status: "running",
            requestedAt: at,
            startedAt: at,
            completedAt: null,
            checkpointId: null,
            contextHandoffId: null,
          });
          yield* events.write({
            events: [
              {
                id: EventId.make("source-existing-run"),
                type: "run.updated",
                threadId: sourceId,
                occurredAt: at,
                payload: initial,
              },
            ],
          });
          const now = yield* DateTime.now;
          if (scenario === "existing-request-race") {
            yield* events.write({
              events: [
                {
                  id: EventId.make("existing-request-message"),
                  type: "message.updated",
                  threadId: sourceId,
                  occurredAt: now,
                  payload: {
                    id: input.messageId,
                    threadId: sourceId,
                    runId: initial.id,
                    nodeId: null,
                    role: "user",
                    text: input.text,
                    attachments: [],
                    streaming: false,
                    createdAt: now,
                    updatedAt: now,
                    createdBy: "user",
                    creationSource: "web",
                  },
                },
                {
                  id: EventId.make("existing-request-item-event"),
                  type: "turn-item.updated",
                  threadId: sourceId,
                  occurredAt: now,
                  payload: {
                    id: TurnItemId.make("existing-request-item"),
                    threadId: sourceId,
                    runId: initial.id,
                    nodeId: null,
                    providerThreadId: null,
                    providerTurnId: null,
                    nativeItemRef: null,
                    parentItemId: null,
                    ordinal: 0,
                    status: "completed",
                    title: null,
                    startedAt: now,
                    completedAt: now,
                    updatedAt: now,
                    type: "user_message",
                    messageId: input.messageId,
                    text: input.text,
                    attachments: [],
                    createdBy: "user",
                    creationSource: "web",
                    inputIntent: "turn_start",
                  },
                },
              ],
            });
            originalSourceItemOrdinal = (yield* projections.getThreadProjection(
              sourceId,
            )).turnItems.find((item) => item.id === "existing-request-item")!.ordinal;
          }
          const handoff =
            scenario === "source-admission-race"
              ? yield* delegate(input).pipe(Effect.forkChild)
              : undefined;
          if (handoff) yield* Deferred.await(entered);
          // New human steering reuses the existing run and TestClock instant.
          yield* (yield* ThreadCommandExecutor.ThreadCommandExecutor).withLock(
            sourceId,
            events.write({
              events: [
                {
                  id: EventId.make("human-during-target-admission"),
                  type: "message.updated",
                  threadId: sourceId,
                  occurredAt: now,
                  payload: {
                    id: MessageId.make("human-during-target-admission"),
                    threadId: sourceId,
                    runId: initial.id,
                    nodeId: null,
                    role: "user",
                    text: "Newer steering",
                    attachments: [],
                    createdBy: "user",
                    creationSource: "web",
                    streaming: false,
                    createdAt: now,
                    updatedAt: now,
                  },
                },
                {
                  id: EventId.make("human-during-target-item"),
                  type: "turn-item.updated",
                  threadId: sourceId,
                  occurredAt: now,
                  payload: {
                    id: TurnItemId.make("human-during-target-item"),
                    threadId: sourceId,
                    runId: initial.id,
                    nodeId: null,
                    providerThreadId: null,
                    providerTurnId: null,
                    nativeItemRef: null,
                    parentItemId: null,
                    ordinal: 0,
                    status: "completed",
                    title: null,
                    startedAt: now,
                    completedAt: now,
                    updatedAt: now,
                    type: "user_message",
                    messageId: MessageId.make("human-during-target-admission"),
                    text: "Newer steering",
                    attachments: [],
                    createdBy: "user",
                    creationSource: "web",
                    inputIntent: "steer",
                  },
                },
              ],
            }),
          );
          if (handoff) {
            yield* Deferred.succeed(release, undefined);
            first = yield* Fiber.join(handoff);
          } else first = yield* delegate(input);
        } else first = yield* delegate(input);
        assert.deepEqual(yield* delegate(input), first);
        const changed = yield* delegate({ ...input, text: "Different task" }).pipe(Effect.flip);
        assert.include(changed.message, "different task");
        const source = yield* projections.getThreadProjection(sourceId);
        const notice = source.turnItems.find((item) => item.type === "system_notice");
        assert.isDefined(notice);
        if (!notice || notice.type !== "system_notice" || !notice.agentDelegation) return;
        const target = yield* projections.getThreadProjection(agentThreadId);
        assert.isNull(target.thread.lineage.parentThreadId);
        assert.lengthOf(target.runs, 1);
        if (scenario === "attachments") {
          const sourceFile = source.messages[0]!.attachments![0]!;
          const targetFile = target.messages[0]!.attachments![0]!;
          assert.notEqual(sourceFile.id, targetFile.id);
          const sourcePath = resolveAttachmentPath({
            attachmentsDir: config.attachmentsDir,
            attachment: sourceFile,
          });
          if (sourcePath === null) return yield* Effect.die("Missing source attachment path");
          assert.equal(yield* fs.readFileString(sourcePath), "Original attachment");
          const targetPath = resolveAttachmentPath({
            attachmentsDir: config.attachmentsDir,
            attachment: targetFile,
          });
          if (targetPath === null) return yield* Effect.die("Missing target attachment path");
          assert.equal(yield* fs.readFileString(targetPath), "Original attachment");
          assert.lengthOf(yield* fs.readDirectory(config.attachmentsDir), 3);
          assert.equal(copyCount, 4);
        }

        if (scenario === "source-admission-race" || scenario === "existing-request-race") {
          assert.equal(notice.agentDelegation.sourceRunOrdinal, 1);
          assert.equal(notice.agentDelegation.sourceTurnItemOrdinal, originalSourceItemOrdinal);
          const preserved = (yield* projections.getThreadProjection(sourceId)).turnItems.find(
            (item) => item.type === "system_notice",
          );
          assert.deepEqual(preserved, notice);
        }
        if (scenario === "source-admission-race") {
          const secondProjectId = ProjectId.make("second-agent");
          const secondThreadId = ThreadId.make("second-agent-chat");
          const profile = Option.getOrThrow(yield* projects.get(agentId)).agentProfile!;
          yield* projects.apply({
            sequence: 100,
            eventId: EventId.make("second-agent-project"),
            aggregateKind: "project",
            aggregateId: secondProjectId,
            occurredAt: DateTime.formatIso(at),
            commandId: null,
            causationEventId: null,
            correlationId: null,
            metadata: {},
            type: "project.created",
            payload: {
              projectId: secondProjectId,
              title: "Blair",
              workspaceRoot: "/tmp/agent-blair",
              defaultModelSelection: modelSelection,
              scripts: [],
              agentProfile: { ...profile, conversationThreadId: secondThreadId },
              createdAt: DateTime.formatIso(at),
              updatedAt: DateTime.formatIso(at),
            },
          });
          yield* events.write({
            events: [
              {
                id: EventId.make("second-agent-created"),
                type: "thread.created",
                threadId: secondThreadId,
                occurredAt: at,
                payload: {
                  ...target.thread,
                  id: secondThreadId,
                  projectId: secondProjectId,
                  lineage: {
                    rootThreadId: secondThreadId,
                    parentThreadId: null,
                    relationshipToParent: null,
                  },
                },
              },
            ],
          });
          const secondInput = {
            ...input,
            commandId: CommandId.make("delegate-second-agent"),
            agentProjectId: secondProjectId,
          };
          yield* delegate(secondInput);
          yield* delegate(secondInput);
          const secondNotice = (yield* projections.getThreadProjection(sourceId)).turnItems.find(
            (item) =>
              item.type === "system_notice" &&
              item.agentDelegation?.agentProjectId === secondProjectId,
          );
          if (!secondNotice || secondNotice.type !== "system_notice")
            return yield* Effect.die("Missing second agent acknowledgment");
          assert.equal(secondNotice.agentDelegation?.sourceTurnItemOrdinal, 0);
          assert.equal(
            secondNotice.agentDelegation?.sourceRunOrdinal,
            notice.agentDelegation.sourceRunOrdinal,
          );
          assert.equal(
            secondNotice.agentDelegation?.sourceRequestedAt,
            notice.agentDelegation.sourceRequestedAt,
          );
          const second = yield* projections.getThreadProjection(secondThreadId);
          yield* events.write({
            events: [
              {
                id: EventId.make("second-agent-run-completed"),
                type: "run.updated",
                threadId: secondThreadId,
                occurredAt: at,
                payload: { ...second.runs[0]!, status: "completed", completedAt: at },
              },
              {
                id: EventId.make("second-agent-reply"),
                type: "message.updated",
                threadId: secondThreadId,
                occurredAt: at,
                payload: {
                  id: MessageId.make("second-agent-reply"),
                  threadId: secondThreadId,
                  runId: second.runs[0]!.id,
                  nodeId: null,
                  role: "assistant",
                  text: "Second result",
                  attachments: [],
                  streaming: false,
                  createdAt: at,
                  updatedAt: at,
                  createdBy: "agent",
                  creationSource: "provider",
                },
              },
            ],
          });
        }
        const run = target.runs[0]!;
        yield* events.write({
          events: [
            {
              id: EventId.make("run-completed"),
              type: "run.updated",
              threadId: agentThreadId,
              occurredAt: at,
              payload: { ...run, status: "completed", completedAt: at },
            },
            ...[run.id, RunId.make("later-unrelated-run")].map((runId, index) => ({
              id: EventId.make(`reply-${index}`),
              type: "message.updated" as const,
              threadId: agentThreadId,
              occurredAt: at,
              payload: {
                id: MessageId.make(`reply-${index}`),
                threadId: agentThreadId,
                runId,
                nodeId: null,
                role: "assistant" as const,
                text: index ? "Later reply" : "Original result",
                attachments: [],
                streaming: false,
                createdAt: at,
                updatedAt: at,
                createdBy: "agent" as const,
                creationSource: "provider" as const,
              },
            })),
          ],
        });
        const result = yield* getAgentDelegation({
          sourceThreadId: sourceId,
          activityId: EventId.make(notice.id),
        });
        assert.equal(result.status, "completed");
        assert.deepEqual(
          result.messages.map((message) => message.text),
          ["Original result"],
        );
        assert.equal(result.targetTurnId, notice.agentDelegation.targetTurnId);
        if (scenario === "archive") {
          const sourceThread = (yield* projections.getThreadProjection(sourceId)).thread;
          yield* events.write({
            events: [
              {
                id: EventId.make("source-archived"),
                type: "thread.archived",
                threadId: sourceId,
                occurredAt: at,
                payload: { ...sourceThread, archivedAt: at },
              },
            ],
          });
        }
        if (scenario === "new-work") {
          const later = DateTime.makeUnsafe("2099-01-01T00:00:00Z");
          yield* events.write({
            events: [
              {
                id: EventId.make("new-human-request"),
                type: "message.updated",
                threadId: sourceId,
                occurredAt: later,
                payload: {
                  id: MessageId.make("later-human-request"),
                  threadId: sourceId,
                  runId: null,
                  nodeId: null,
                  role: "user",
                  text: "Do other work now",
                  attachments: [],
                  createdBy: "user",
                  creationSource: "web",
                  streaming: false,
                  createdAt: later,
                  updatedAt: later,
                },
              },
            ],
          });
        }
        yield* (yield* AgentDelegation).reconcile();
        // Reconstruct the service around the same persisted stores, then drain again.
        yield* Effect.gen(function* () {
          yield* (yield* AgentDelegation).reconcile();
        }).pipe(Effect.provide(Layer.fresh(delegationLayer)));
        const after = yield* projections.getThreadProjection(sourceId);
        const deliveries = after.messages.filter((message) =>
          message.id.startsWith("agent-delegate:result:"),
        );
        assert.lengthOf(deliveries, scenario === "complete" || scenario === "attachments" ? 1 : 0);
        if (scenario === "complete") assert.include(deliveries[0]!.text, "Original result");
        const receipt = yield* (yield* CommandReceiptStore.CommandReceiptStoreV2).getByCommandId(
          CommandId.make(`agent-delegate:result:${notice.id}`),
        );
        assert.equal(Option.getOrThrow(receipt).status, "accepted");
        if (scenario === "source-admission-race") {
          const notices = after.turnItems.filter(
            (item) => item.type === "system_notice" && item.agentDelegation,
          );
          assert.lengthOf(notices, 2);
          for (const notice of notices) {
            const disposed =
              yield* (yield* CommandReceiptStore.CommandReceiptStoreV2).getByCommandId(
                CommandId.make(`agent-delegate:result:${notice.id}`),
              );
            assert.equal(Option.getOrThrow(disposed).status, "accepted");
          }
        }

        assert.equal(
          Option.getOrThrow(yield* projects.get(agentId)).agentProfile?.conversationThreadId,
          agentThreadId,
        );
      }).pipe(Effect.provide(testLayer)),
    );
});

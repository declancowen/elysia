import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  CommandId,
  ComposerContextId,
  EventId,
  MessageId,
  OrchestrationV2AppThread,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { ServerConfig } from "../config.ts";
import { ProviderRegistry } from "../provider/ProviderRegistry.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as EventSink from "./EventSink.ts";
import * as EventStore from "./EventStore.ts";
import * as CommandReceiptStore from "./CommandReceiptStore.ts";
import * as EffectOutbox from "./EffectOutbox.ts";
import * as TurnItemPositionStore from "./TurnItemPositionStore.ts";
import * as ProjectStore from "./ProjectStore.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ProviderSessions from "./ProviderSessionManager.ts";
import * as Threads from "./ThreadManagementService.ts";
import { getAgentConversationPreviews, layer } from "./PersistentAgents.ts";

const decodeThread = Schema.decodeUnknownEffect(OrchestrationV2AppThread);

const stores = Layer.mergeAll(
  ProjectStore.layer,
  ProjectionStore.layer,
  EventStore.layer,
  CommandReceiptStore.layer,
  EffectOutbox.layer,
  TurnItemPositionStore.layer,
).pipe(Layer.provideMerge(SqlitePersistence.layerMemory));
const dependencies = Layer.mergeAll(
  stores,
  EventSink.layerFromStores.pipe(Layer.provide(stores)),
  NodeServices.layer,
  ServerConfig.layerTest(process.cwd(), { prefix: "agent-preview-test-" }).pipe(
    Layer.provide(NodeServices.layer),
  ),
  Layer.mock(ProviderRegistry)({ getProviders: Effect.die("Read started provider lookup") }),
  Layer.mock(ServerSettingsService)({}),
  Layer.mock(ProjectService.ProjectService)({}),
  Layer.mock(Threads.ThreadManagementService)({}),
  Layer.mock(ProviderSessions.ProviderSessionManagerV2)({}),
);
const testLayer = layer.pipe(Layer.provideMerge(dependencies));

it.effect(
  "returns bounded canonical agent and group previews without ordinary shell message bodies",
  () =>
    Effect.gen(function* () {
      const projects = yield* ProjectStore.ProjectStoreV2;
      const sink = yield* EventSink.EventSinkV2;
      const at = DateTime.makeUnsafe("2026-10-03T00:00:00Z");
      const ids = [
        ProjectId.make("agent"),
        ProjectId.make("group"),
        ProjectId.make("ordinary"),
        ProjectId.make("wrong-owner"),
      ];
      for (const projectId of ids) {
        const threadId = ThreadId.make(`${projectId}:chat`);
        yield* projects.apply({
          sequence: 1,
          eventId: EventId.make(`${projectId}:project`),
          aggregateKind: "project",
          aggregateId: projectId,
          occurredAt: DateTime.formatIso(at),
          commandId: null,
          causationEventId: null,
          correlationId: null,
          metadata: {},
          type: "project.created",
          payload: {
            projectId,
            title: projectId,
            workspaceRoot: `/tmp/${projectId}`,
            defaultModelSelection: null,
            scripts: [],
            createdAt: DateTime.formatIso(at),
            updatedAt: DateTime.formatIso(at),
            ...(projectId === "ordinary"
              ? {}
              : {
                  agentProfile: {
                    instructions: "Help",
                    avatar: { preset: "brain", color: "blue" },
                    archived: false,
                    notificationsEnabled: true,
                    conversationThreadId:
                      projectId === "wrong-owner" ? ThreadId.make("agent:chat") : threadId,
                    ...(projectId === "group"
                      ? {
                          group: {
                            memberProjectIds: [ids[0]!, ProjectId.make("second")],
                            leadProjectId: ids[0]!,
                          },
                        }
                      : {}),
                  },
                }),
          },
        });
        const thread = yield* decodeThread({
          id: threadId,
          projectId,
          title: projectId,
          providerInstanceId: ProviderInstanceId.make("elysia"),
          modelSelection: { instanceId: ProviderInstanceId.make("elysia"), model: "native-model" },
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          activeProviderThreadId: null,
          lineage: { rootThreadId: threadId, parentThreadId: null, relationshipToParent: null },
          forkedFrom: null,
          createdAt: at,
          updatedAt: at,
          archivedAt: null,
          deletedAt: null,
          createdBy: "user",
          creationSource: "web",
        });
        yield* sink.write({
          events: [
            {
              id: EventId.make(`${threadId}:created`),
              type: "thread.created",
              threadId,
              occurredAt: at,
              payload: thread,
            },
          ],
        });
        for (const index of [0, 1]) {
          const handoff = projectId === "agent" && index === 1;
          const ask = "Review the source file " + "x".repeat(300);
          const context = {
            version: 1,
            records: [
              {
                version: 1,
                contextId: ComposerContextId.make(`handoff_source_${"0".repeat(64)}`),
                kind: "elysia-agent-delegation-source",
                label: "Original request attachments",
                payload: {
                  handoff: { sourceThreadId: "origin-chat", sourceThreadTitle: "Origin", ask },
                },
              },
            ],
          } as const;
          const text = handoff
            ? `[Elysia handoff sha256:${"0".repeat(64)}]\n\n${"Native origin context. ".repeat(100)}\n\nCurrent request:\n\n${ask}`
            : index === 0
              ? "First request"
              : "Latest response " + (projectId === "group" ? "😀" : "x").repeat(300);
          const messageId = MessageId.make(`${threadId}:${index}`);
          yield* sink.commitCommand({
            commandId: CommandId.make(`${threadId}:message:${index}`),
            threadId,
            commandType: "agent-group.result",
            acceptedAt: at,
            effects: [],
            events: [
              {
                id: EventId.make(`${messageId}:message`),
                type: "message.updated",
                threadId,
                occurredAt: at,
                payload: {
                  id: messageId,
                  threadId,
                  runId: null,
                  nodeId: null,
                  role: handoff ? "user" : "assistant",
                  ...(handoff ? { context } : {}),
                  text,
                  attachments: [],
                  streaming: false,
                  createdAt: at,
                  updatedAt: at,
                  createdBy: handoff ? "user" : "agent",
                  creationSource: handoff ? "web" : "server",
                },
              },
              {
                id: EventId.make(`${messageId}:item`),
                type: "turn-item.updated",
                threadId,
                occurredAt: at,
                payload: {
                  id: TurnItemId.make(`${messageId}:item`),
                  threadId,
                  runId: null,
                  nodeId: null,
                  providerThreadId: null,
                  providerTurnId: null,
                  nativeItemRef: null,
                  parentItemId: null,
                  ordinal: 0,
                  status: "completed",
                  title: null,
                  startedAt: at,
                  completedAt: at,
                  updatedAt: at,
                  messageId,
                  text,
                  ...(handoff
                    ? ({
                        type: "user_message",
                        createdBy: "user",
                        creationSource: "web",
                        inputIntent: "turn_start",
                        attachments: [],
                        context,
                      } as const)
                    : ({ type: "assistant_message", streaming: false } as const)),
                },
              },
            ],
          });
        }
      }
      const previews = yield* getAgentConversationPreviews({
        projectIds: [...ids, ids[0]!, ProjectId.make("missing")],
      });
      assert.lengthOf(previews, 2);
      assert.deepEqual(previews.map((preview) => preview.projectId).toSorted(), ["agent", "group"]);
      for (const preview of previews) {
        assert.equal(preview.threadId, `${preview.projectId}:chat`);
        assert.equal(
          preview.text,
          (preview.projectId === "agent"
            ? "Review the source file " + "x".repeat(300)
            : "Latest response " + "😀".repeat(300)
          ).slice(0, 240),
        );
        assert.equal(preview.updatedAt, DateTime.formatIso(at));
      }
      assert.deepEqual(yield* getAgentConversationPreviews({ projectIds: [] }), []);
      yield* getAgentConversationPreviews({
        projectIds: Array.from({ length: 101 }, () => ids[0]!),
      }).pipe(Effect.flip);
      const shell = yield* (yield* ProjectionStore.ProjectionStoreV2).getShellSnapshot();
      assert.isTrue(shell.threads.every((thread) => thread.latestVisibleMessage === null));
    }).pipe(Effect.provide(testLayer)),
);

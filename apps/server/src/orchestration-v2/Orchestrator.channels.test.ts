import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { withChannelReply, readChannelReply } from "@t3tools/shared/channelReplies";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { CodexProviderCapabilitiesV2 } from "./Adapters/CodexAdapterV2.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ProjectStore from "./ProjectStore.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import type { ProviderAdapterV2Shape } from "./ProviderAdapter.ts";
import { layerWithRegistry } from "./testkit/ProviderReplayHarness.ts";
const instanceId = ProviderInstanceId.make("claudeAgent");
const modelSelection = { instanceId, model: "deepseek-v4.1-flash" };
const adapter: ProviderAdapterV2Shape = {
  instanceId,
  driver: ProviderDriverKind.make("claudeAgent"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: (input) =>
    Effect.succeed(
      input.current.model === input.target.model
        ? { type: "apply_on_next_turn" }
        : { type: "create_with_handoff" },
    ),
  openSession: () => Effect.die("Admission must not start a provider process"),
};
const database = SqlitePersistence.layerMemory;
const layer = Layer.mergeAll(
  database,
  ProjectionStore.layer.pipe(Layer.provide(database)),
  ProjectStore.layer.pipe(Layer.provide(database)),
  layerWithRegistry(
    { name: "channel-admission" },
    ProviderAdapterRegistry.layerFromAdapters([adapter]),
    { databaseLayer: database, runEffectWorker: false },
  ),
);
it.effect(
  "owns channel runs, inherits member models, queues fresh sessions and validates reply roots",
  () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const projects = yield* ProjectStore.ProjectStoreV2;
      const now = yield* DateTime.now;
      const member = ProjectId.make("member");
      const other = ProjectId.make("other");
      const otherChat = ThreadId.make("other-chat");
      const team = ProjectId.make("team");
      const memberChat = ThreadId.make("member-chat");
      const channel = ThreadId.make("channel-chat");
      const outside = ThreadId.make("outside-chat");
      for (const [id, threadId] of [
        [member, memberChat],
        [other, otherChat],
        [team, channel],
      ] as const) {
        yield* projects.apply({
          sequence: 1,
          eventId: EventId.make(`project-${id}`),
          aggregateKind: "project",
          aggregateId: id,
          occurredAt: DateTime.formatIso(now),
          commandId: null,
          causationEventId: null,
          correlationId: null,
          metadata: {},
          type: "project.created",
          payload: {
            projectId: id,
            title: id,
            workspaceRoot: `/tmp/${id}`,
            defaultModelSelection: modelSelection,
            scripts: [],
            createdAt: DateTime.formatIso(now),
            updatedAt: DateTime.formatIso(now),
            agentProfile: {
              instructions: "Remember my work",
              avatar: { preset: "brain", color: "blue" },
              archived: false,
              notificationsEnabled: true,
              conversationThreadId: threadId,
              ...(id === team
                ? {
                    group: {
                      memberProjectIds: [member, ProjectId.make("other")],
                      leadProjectId: member,
                    },
                  }
                : {}),
            },
          },
        });
      }
      for (const [threadId, projectId] of [
        [memberChat, member],
        [otherChat, other],
        [channel, team],
        [outside, ProjectId.make("external")],
      ] as const)
        yield* orchestrator.dispatch({
          type: "thread.create",
          commandId: CommandId.make(`create-${threadId}`),
          threadId,
          projectId,
          title: threadId,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          createdBy: "user",
          creationSource: "web",
        });
      const dispatch = (
        threadId: ThreadId,
        id: string,
        context?: ReturnType<typeof withChannelReply>,
      ) =>
        orchestrator.dispatch({
          type: "message.dispatch",
          commandId: CommandId.make(id),
          messageId: MessageId.make(id),
          threadId,
          text: id,
          attachments: [],
          dispatchMode: { type: "queue_after_active" },
          modelSelection: { ...modelSelection, model: "wrong-channel-default" },
          createdBy: "user",
          creationSource: "web",
          ...(context ? { context } : {}),
        });
      yield* dispatch(channel, "parent");
      yield* dispatch(
        channel,
        "child",
        withChannelReply(undefined, {
          replyToMessageId: MessageId.make("parent"),
          rootMessageId: MessageId.make("forged"),
        }),
      );
      yield* dispatch(
        channel,
        "grandchild",
        withChannelReply(undefined, {
          replyToMessageId: MessageId.make("child"),
          rootMessageId: MessageId.make("child"),
        }),
      );
      const state = yield* projections.getThreadProjection(channel);
      assert.equal(state.runs.length, 3);
      assert.ok(
        state.runs.every(
          (run) =>
            run.channelAgentProjectId === member &&
            run.modelSelection.model === modelSelection.model,
        ),
      );
      assert.equal(new Set(state.runs.map((run) => run.providerThreadId)).size, 3);
      assert.equal(
        readChannelReply(state.messages.find((message) => message.id === "grandchild")?.context)
          ?.rootMessageId,
        "parent",
      );
      assert.equal((yield* projections.getThreadProjection(memberChat)).messages.length, 0);
      yield* orchestrator.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make("member-first"),
        messageId: MessageId.make("member-first"),
        threadId: memberChat,
        text: "first",
        attachments: [],
        dispatchMode: { type: "queue_after_active" },
        createdBy: "user",
        creationSource: "web",
      });
      yield* orchestrator.dispatch({
        type: "thread.model-selection.set",
        commandId: CommandId.make("change-agent-model"),
        threadId: memberChat,
        modelSelection: { ...modelSelection, model: "gpt-5-4" },
      });
      yield* orchestrator.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make("member-queued"),
        messageId: MessageId.make("member-queued"),
        threadId: memberChat,
        text: "next",
        attachments: [],
        dispatchMode: { type: "queue_after_active" },
        createdBy: "user",
        creationSource: "web",
      });
      const memberState = yield* projections.getThreadProjection(memberChat);
      assert.equal(memberState.runs[1]!.status, "queued");
      assert.notEqual(memberState.runs[0]!.providerThreadId, memberState.runs[1]!.providerThreadId);
      assert.equal(memberState.runs[1]!.modelSelection.model, "gpt-5-4");
      for (const run of memberState.runs)
        yield* projections.apply({
          id: EventId.make(`complete-${run.id}`),
          type: "run.updated",
          threadId: memberChat,
          runId: run.id,
          occurredAt: now,
          payload: { ...run, status: "completed", completedAt: now },
        });
      yield* orchestrator.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make("member-after-reset"),
        messageId: MessageId.make("member-after-reset"),
        threadId: memberChat,
        text: "continue after reset",
        attachments: [],
        dispatchMode: { type: "queue_after_active" },
        createdBy: "user",
        creationSource: "web",
      });
      const continued = yield* projections.getThreadProjection(memberChat);
      assert.equal(continued.messages.length, 3);
      assert.equal(continued.runs.at(-1)?.modelSelection.model, "gpt-5-4");
      assert.notEqual(
        continued.runs.at(-1)?.providerThreadId,
        memberState.runs[0]!.providerThreadId,
      );

      yield* orchestrator.dispatch({
        type: "thread.model-selection.set",
        commandId: CommandId.make("reviewer-model"),
        threadId: otherChat,
        modelSelection: { ...modelSelection, model: "gpt-5-4" },
      });
      yield* orchestrator.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make("channel-collaboration"),
        messageId: MessageId.make("channel-collaboration"),
        threadId: channel,
        channelAgentProjectId: other,
        text: "Review the shared approach.",
        attachments: [],
        createdBy: "agent",
        creationSource: "mcp",
        dispatchMode: { type: "queue_after_active" },
        context: withChannelReply(undefined, {
          replyToMessageId: MessageId.make("child"),
          rootMessageId: MessageId.make("child"),
        }),
      });
      const collaboration = yield* projections.getThreadProjection(channel);
      assert.equal(collaboration.runs.at(-1)?.channelAgentProjectId, other);
      assert.equal(collaboration.runs.at(-1)?.modelSelection.model, "gpt-5-4");
      assert.equal(collaboration.runs.at(-1)?.status, "queued");
      assert.equal(
        readChannelReply(collaboration.messages.at(-1)?.context)?.rootMessageId,
        "parent",
      );
      assert.equal((yield* projections.getThreadProjection(otherChat)).messages.length, 0);
      // Both targeted member work and ordinary self-sends share the same automatic budget.
      const automatic = (index: number) =>
        orchestrator.dispatch({
          type: "message.dispatch",
          commandId: CommandId.make(`automatic-${index}`),
          messageId: MessageId.make(`automatic-${index}`),
          threadId: channel,
          ...(index % 2 ? { channelAgentProjectId: other } : {}),
          text: "Check the shared answer",
          attachments: [],
          createdBy: "agent",
          creationSource: index % 2 ? "mcp" : "provider",
          dispatchMode: { type: "queue_after_active" },
        });
      for (let index = 1; index < 8; index++) yield* automatic(index);
      const beforeLimit = yield* projections.getThreadProjection(channel);
      yield* automatic(7); // Receipt replay must not consume another slot.
      const limited = yield* automatic(8).pipe(Effect.flip);
      assert.equal(limited._tag, "OrchestratorDispatchError");
      assert.match(String(limited.cause), /8 automatic messages/);
      assert.equal(
        (yield* projections.getThreadProjection(channel)).messages.length,
        beforeLimit.messages.length,
      );
      yield* dispatch(channel, "continue-collaboration");
      yield* automatic(9);
      assert.ok(
        (yield* projections.getThreadProjection(channel)).messages.some(
          (message) => message.id === "automatic-9",
        ),
      );
      const ordinaryMember = yield* orchestrator
        .dispatch({
          type: "message.dispatch",
          commandId: CommandId.make("invalid-member-target"),
          messageId: MessageId.make("invalid-member-target"),
          threadId: outside,
          channelAgentProjectId: member,
          text: "Review this",
          attachments: [],
          createdBy: "agent",
          creationSource: "mcp",
          dispatchMode: { type: "queue_after_active" },
        })
        .pipe(Effect.flip);
      assert.equal(ordinaryMember._tag, "OrchestratorDispatchError");
      yield* dispatch(outside, "outside");
      const invalid = yield* dispatch(
        channel,
        "invalid",
        withChannelReply(undefined, {
          replyToMessageId: MessageId.make("outside"),
          rootMessageId: MessageId.make("outside"),
        }),
      ).pipe(Effect.flip);
      assert.equal(invalid._tag, "OrchestratorDispatchError");
    }).pipe(Effect.provide(layer)),
);

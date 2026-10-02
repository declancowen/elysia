import {
  CommandId,
  EventId,
  ComposerContextId,
  MessageId,
  OrchestrationDispatchCommandError,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type AgentDelegateInput,
  type OrchestrationCommand,
} from "@t3tools/contracts";
import { formatAgentMention } from "@t3tools/shared/agentMentions";
import { formatComposerContextReference } from "@t3tools/shared/composerContextReferences";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { createPendingAttachmentId, resolveAttachmentPath } from "../attachmentStore.ts";
import { ServerConfig } from "../config.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { OrchestrationCommandReceiptRepository } from "../persistence/Services/OrchestrationCommandReceipts.ts";
import { ProjectionTurnRepository } from "../persistence/Services/ProjectionTurns.ts";
import { collectComposerContextReferences } from "@t3tools/shared/composerContextReferences";
import * as RepositoryIdentityResolver from "../project/RepositoryIdentityResolver.ts";
import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";
import { delegateToPersistentAgent, getAgentDelegation } from "./AgentDelegation.ts";
import { DELEGATION_SOURCE_CONTEXT_KIND, normalizeDispatchCommand } from "./Normalizer.ts";
import { projectComposerContextForProvider } from "@t3tools/shared/composerContextReferences";
import { OrchestrationLayerLive } from "./runtimeLayer.ts";
import { OrchestrationEngineService } from "./Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./Services/ProjectionSnapshotQuery.ts";

const sourceProjectId = ProjectId.make("source-project");
const agentProjectId = ProjectId.make("friday-project");
const sourceThreadId = ThreadId.make("source-chat");
const agentThreadId = ThreadId.make("agent-friday-chat");
const modelSelection = { instanceId: ProviderInstanceId.make("claude"), model: "kimi-k3" };
const now = "2026-10-02T09:00:00.000Z";
const profile = {
  instructions: "Research tasks and retain durable notes.",
  avatar: { preset: "robot" as const, color: "#28B4FF" as const },
  notificationsEnabled: true,
  archived: false,
  conversationThreadId: agentThreadId,
};
const input: AgentDelegateInput = {
  commandId: CommandId.make("delegate-1"),
  sourceThreadId,
  agentProjectId,
  messageId: MessageId.make("source-message-1"),
  text: `${formatAgentMention(agentProjectId, "Friday")} investigate the next release.`,
};
const testLayer = Layer.mergeAll(OrchestrationLayerLive, WorkspacePaths.layer).pipe(
  Layer.provide(
    Layer.succeed(RepositoryIdentityResolver.RepositoryIdentityResolver, {
      resolve: () => Effect.succeed(null),
    }),
  ),
  Layer.provide(SqlitePersistenceMemory),
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "elysia-agent-delegation-" })),
  Layer.provideMerge(NodeServices.layer),
);

const seed = Effect.gen(function* () {
  const engine = yield* OrchestrationEngineService;
  const query = yield* ProjectionSnapshotQuery;
  const dispatch = (command: OrchestrationCommand) =>
    engine
      .dispatch(command)
      .pipe(
        Effect.mapError(
          (cause) => new OrchestrationDispatchCommandError({ message: String(cause), cause }),
        ),
      );
  for (const [projectId, threadId, title] of [
    [sourceProjectId, sourceThreadId, "Release work"],
    [agentProjectId, agentThreadId, "Friday"],
  ] as const) {
    yield* dispatch({
      type: "project.create",
      commandId: CommandId.make(`create-${projectId}`),
      projectId,
      title,
      workspaceRoot: `/workspaces/${projectId}`,
      ...(projectId === agentProjectId ? { agentProfile: profile } : {}),
      createdAt: now,
    });
    yield* dispatch({
      type: "thread.create",
      commandId: CommandId.make(`create-${threadId}`),
      threadId,
      projectId,
      title,
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt: now,
    });
  }
  const read = (threadId: ThreadId) =>
    query.getThreadDetailById(threadId).pipe(Effect.map(Option.getOrThrow));
  return { engine, query, dispatch, read };
});

it.effect(
  "accepts work in the existing agent chat before writing a source request and linked acknowledgment",
  () =>
    Effect.gen(function* () {
      const { engine, query, dispatch, read } = yield* seed;
      yield* dispatch({
        type: "thread.message.user.append",
        commandId: CommandId.make("previous-question"),
        threadId: sourceThreadId,
        message: {
          messageId: MessageId.make("previous"),
          text: "We ship macOS and Windows installers.",
          attachments: [],
        },
        createdAt: now,
      });
      const before = yield* query.getSnapshot();
      const reachedTarget = yield* Deferred.make<void>();
      const acceptTarget = yield* Deferred.make<void>();
      const task = yield* delegateToPersistentAgent(input, (command) =>
        Effect.gen(function* () {
          if (command.type === "thread.turn.start") {
            assert.equal(command.threadId, agentThreadId);
            assert.isUndefined(command.modelSelection);
            assert.isUndefined(command.bootstrap);
            assert.isTrue(command.requireIdle);
            yield* Deferred.succeed(reachedTarget, undefined);
            yield* Deferred.await(acceptTarget);
          }
          return yield* dispatch(command);
        }),
      ).pipe(Effect.forkScoped);
      yield* Deferred.await(reachedTarget);
      const waiting = yield* read(sourceThreadId);
      assert.deepEqual(
        waiting.messages.map((message) => message.id),
        ["previous"],
      );
      assert.lengthOf(waiting.activities, 0);
      yield* Deferred.succeed(acceptTarget, undefined);
      assert.deepEqual(yield* Fiber.join(task), {
        projectId: agentProjectId,
        threadId: agentThreadId,
      });
      const target = yield* read(agentThreadId);
      assert.lengthOf(target.messages, 1);
      assert.include(target.messages[0]!.text, "We ship macOS and Windows installers.");
      assert.include(
        target.messages[0]!.text,
        "Origin workspace (reference only): /workspaces/source-project",
      );
      assert.include(target.messages[0]!.text, "@Friday investigate the next release.");
      assert.notInclude(target.messages[0]!.text, "t3-context://v1/agent/");
      const source = yield* read(sourceThreadId);
      assert.equal(
        source.messages.find((message) => message.id === input.messageId)?.text,
        input.text,
      );
      assert.equal(source.activities[0]?.summary, "Friday: I got it. I’ll continue in my chat.");
      assert.deepEqual(source.activities[0]?.payload, {
        agentProjectId,
        agentThreadId,
        agentName: "Friday",
        sourceMessageId: input.messageId,
        targetMessageId: `agent-delegate:${sourceThreadId}:${input.messageId}:${agentProjectId}`,
        targetTurnId: null,
      });
      const after = yield* query.getSnapshot();
      assert.lengthOf(after.projects, before.projects.length);
      assert.lengthOf(after.threads, before.threads.length);
      assert.deepEqual(
        after.projects.find((project) => project.id === agentProjectId)?.agentProfile,
        profile,
      );
      assert.deepEqual(target.modelSelection, modelSelection);
      assert.equal(target.worktreePath, null);
      const events = yield* Stream.runCollect(engine.readEvents(0));
      const turn = events.find((event) => event.type === "thread.turn-start-requested")!;
      const acknowledgment = events.find((event) => event.type === "thread.activity-appended")!;
      assert.isBelow(turn.sequence, acknowledgment.sequence);
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
);

it.effect(
  "retries a lost acknowledgment without dispatching another native turn or user message",
  () =>
    Effect.gen(function* () {
      const { dispatch, read } = yield* seed;
      let failAck = true;
      let targetStarts = 0;
      const flaky = (command: OrchestrationCommand) => {
        if (command.type === "thread.turn.start") targetStarts++;
        if (command.type === "thread.activity.append" && failAck) {
          failAck = false;
          return Effect.fail(
            new OrchestrationDispatchCommandError({
              message: "Source acknowledgment could not be persisted.",
            }),
          );
        }
        return dispatch(command);
      };
      const error = yield* delegateToPersistentAgent(input, flaky).pipe(Effect.flip);
      assert.include(error.message, "acknowledgment");
      assert.lengthOf((yield* read(agentThreadId)).messages, 1);
      assert.lengthOf((yield* read(sourceThreadId)).activities, 0);
      yield* delegateToPersistentAgent(input, flaky);
      yield* delegateToPersistentAgent(input, flaky);
      assert.equal(targetStarts, 1);
      assert.lengthOf((yield* read(sourceThreadId)).messages, 1);
      assert.lengthOf((yield* read(sourceThreadId)).activities, 1);
      const changed = yield* delegateToPersistentAgent(
        { ...input, text: "A different task" },
        flaky,
      ).pipe(Effect.flip);
      assert.include(changed.message, "different task");
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
);

for (const rejected of [
  "archived",
  "missing-link",
  "queued",
  "running",
  "missing-agent",
] as const) {
  it.effect(`rejects ${rejected} agents without writing a source request`, () =>
    Effect.gen(function* () {
      const { dispatch, read, query } = yield* seed;
      if (rejected === "archived" || rejected === "missing-link") {
        yield* dispatch({
          type: "project.meta.update",
          commandId: CommandId.make("agent-unavailable"),
          projectId: agentProjectId,
          agentProfile:
            rejected === "archived"
              ? { ...profile, archived: true }
              : {
                  instructions: profile.instructions,
                  avatar: profile.avatar,
                  notificationsEnabled: true,
                  archived: false,
                },
        });
      }
      if (rejected === "queued") {
        yield* dispatch({
          type: "thread.turn.start",
          commandId: CommandId.make("already-queued"),
          threadId: agentThreadId,
          message: {
            messageId: MessageId.make("already-queued"),
            role: "user",
            text: "Existing work",
            attachments: [],
          },
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: now,
        });
      }
      if (rejected === "running") {
        yield* dispatch({
          type: "thread.session.set",
          commandId: CommandId.make("running-session"),
          threadId: agentThreadId,
          session: {
            threadId: agentThreadId,
            status: "running",
            providerName: "claudeAgent",
            providerInstanceId: modelSelection.instanceId,
            runtimeMode: "full-access",
            activeTurnId: null,
            lastError: null,
            updatedAt: now,
          },
          createdAt: now,
        });
      }
      const request =
        rejected === "missing-agent" ? { ...input, agentProjectId: ProjectId.make("gone") } : input;
      const operation =
        rejected === "missing-link"
          ? delegateToPersistentAgent(request, dispatch).pipe(
              Effect.provideService(ProjectionSnapshotQuery, {
                ...query,
                getProjectShellById: (id: ProjectId) =>
                  query.getProjectShellById(id).pipe(
                    Effect.map(
                      Option.map((project) => {
                        if (id !== agentProjectId) return project;
                        const { conversationThreadId: _link, ...legacy } = project.agentProfile!;
                        return { ...project, agentProfile: legacy };
                      }),
                    ),
                  ),
              }),
            )
          : delegateToPersistentAgent(request, dispatch);
      const error = yield* operation.pipe(Effect.flip);
      assert.match(error.message, /Restore|unavailable|busy/);
      assert.lengthOf((yield* read(sourceThreadId)).messages, 0);
      assert.lengthOf((yield* read(sourceThreadId)).activities, 0);
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
  );
}

it.effect(
  "keeps normalized uploads and chips on an accepted retry even after the pending upload disappears",
  () =>
    Effect.gen(function* () {
      const { dispatch, read } = yield* seed;
      const fs = yield* FileSystem.FileSystem;
      const config = yield* ServerConfig;
      const pendingId = createPendingAttachmentId("txt");
      const pendingPath = `${config.attachmentsDir}/${pendingId}.txt`;
      yield* fs.makeDirectory(config.attachmentsDir, { recursive: true });
      yield* fs.writeFileString(pendingPath, "abc");
      const file = {
        type: "file" as const,
        id: pendingId,
        name: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 3,
      };
      const record = {
        version: 1 as const,
        contextId: ComposerContextId.make("notes"),
        kind: "file" as const,
        label: "notes.txt",
        attachmentId: pendingId,
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: 3,
      };
      const imageRecord = {
        ...record,
        kind: "image" as const,
        contextId: ComposerContextId.make("screen"),
        label: "screen.png",
        attachmentId: "screen-upload",
        name: "screen.png",
        mimeType: "image/png",
      };
      const request: AgentDelegateInput = {
        ...input,
        text: `${input.text} ${formatComposerContextReference(record)} ${formatComposerContextReference(imageRecord)}`,
        attachments: [
          file,
          {
            type: "image",
            id: "screen-upload",
            name: "screen.png",
            mimeType: "image/png",
            sizeBytes: 3,
            dataUrl: "data:image/png;base64,AQID",
          },
        ],
        context: { version: 1, records: [record, imageRecord] },
      };
      let failSource = true;
      let targetStarts = 0;
      const flaky = (command: OrchestrationCommand) => {
        if (command.type === "thread.turn.start") targetStarts++;
        if (command.type === "thread.message.user.append" && failSource) {
          failSource = false;
          return Effect.fail(
            new OrchestrationDispatchCommandError({
              message: "Source request could not be persisted.",
            }),
          );
        }
        return dispatch(command);
      };
      yield* delegateToPersistentAgent(request, flaky).pipe(Effect.flip);
      const acceptedTarget = (yield* read(agentThreadId)).messages[0]!;
      yield* fs.writeFileString(
        resolveAttachmentPath({
          attachmentsDir: config.attachmentsDir,
          attachment: acceptedTarget.attachments![0]!,
        })!,
        "Agent changed its copy before source recovery",
      );
      yield* fs.remove(pendingPath);
      yield* delegateToPersistentAgent(request, flaky);
      assert.equal(targetStarts, 1);
      const target = (yield* read(agentThreadId)).messages[0]!;
      const source = (yield* read(sourceThreadId)).messages[0]!;
      assert.lengthOf(target.attachments!, 2);
      assert.lengthOf(source.attachments!, 2);
      assert.notEqual(source.attachments![0]!.id, target.attachments![0]!.id);
      assert.notEqual(source.attachments![1]!.id, target.attachments![1]!.id);
      assert.equal(source.context?.records[0]?.contextId, target.context?.records[0]?.contextId);
      assert.isFalse(
        source.context!.records.some((record) => record.kind === DELEGATION_SOURCE_CONTEXT_KIND),
      );
      const nativeText = projectComposerContextForProvider({
        text: target.text,
        records: target.context!.records,
      });
      assert.notInclude(nativeText, DELEGATION_SOURCE_CONTEXT_KIND);
      assert.notInclude(nativeText, "Original request attachments");
      assert.equal(
        collectComposerContextReferences(source.text).find((reference) => reference.kind === "file")
          ?.contextId,
        source.context?.records[0]?.contextId,
      );
      assert.notEqual(target.attachments![0]!.id, pendingId);
      const targetRecord = target.context!.records[0]!;
      assert.isTrue("attachmentId" in targetRecord);
      assert.equal(
        "attachmentId" in targetRecord ? targetRecord.attachmentId : undefined,
        target.attachments![0]!.id,
      );
      for (const attachment of target.attachments!) {
        const path = resolveAttachmentPath({ attachmentsDir: config.attachmentsDir, attachment });
        assert.isNotNull(path);
        assert.isTrue(yield* fs.exists(path!));
      }
      const targetPath = resolveAttachmentPath({
        attachmentsDir: config.attachmentsDir,
        attachment: target.attachments![0]!,
      })!;
      const sourcePath = resolveAttachmentPath({
        attachmentsDir: config.attachmentsDir,
        attachment: source.attachments![0]!,
      })!;
      assert.equal(yield* fs.readFileString(sourcePath), "abc");
      yield* fs.writeFileString(targetPath, "Agent changed its copy");
      assert.equal(yield* fs.readFileString(sourcePath), "abc");
      // Native rollback can prune an agent turn's assets. The source owns independent files.
      for (const attachment of target.attachments!) {
        yield* fs.remove(
          resolveAttachmentPath({ attachmentsDir: config.attachmentsDir, attachment })!,
        );
      }
      for (const attachment of source.attachments!) {
        assert.equal(
          (yield* fs.readFile(
            resolveAttachmentPath({ attachmentsDir: config.attachmentsDir, attachment })!,
          )).length,
          3,
        );
      }
      yield* delegateToPersistentAgent(request, flaky);
      assert.equal(targetStarts, 1);
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
);

it.effect(
  "cleans private source copies when target attachment preparation fails before acceptance",
  () =>
    Effect.gen(function* () {
      const { dispatch, read } = yield* seed;
      const fs = yield* FileSystem.FileSystem;
      const config = yield* ServerConfig;
      const pendingId = createPendingAttachmentId("txt");
      const pendingPath = `${config.attachmentsDir}/${pendingId}.txt`;
      yield* fs.makeDirectory(config.attachmentsDir, { recursive: true });
      yield* fs.writeFileString(pendingPath, "abc");
      const request: AgentDelegateInput = {
        ...input,
        attachments: [
          { type: "file", id: pendingId, name: "notes.txt", mimeType: "text/plain", sizeBytes: 3 },
          {
            type: "image",
            id: "screen-upload",
            name: "screen.png",
            mimeType: "image/png",
            sizeBytes: 3,
            dataUrl: "data:image/png;base64,AQID",
          },
        ],
      };
      const failed = yield* delegateToPersistentAgent(request, dispatch).pipe(
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          stat: (path) =>
            fs.stat(
              path.startsWith(config.attachmentsDir) && path !== pendingPath
                ? `${path}.removed-before-target-claim`
                : path,
            ),
        }),
        Effect.flip,
      );
      assert.include(failed.message, "attachment not found");
      assert.deepEqual(yield* fs.readDirectory(config.attachmentsDir), [`${pendingId}.txt`]);
      assert.lengthOf((yield* read(sourceThreadId)).messages, 0);
      assert.lengthOf((yield* read(agentThreadId)).messages, 0);
      // A definitive preparation failure leaves the same stable request retryable.
      yield* delegateToPersistentAgent(request, dispatch);
      assert.lengthOf((yield* read(sourceThreadId)).messages, 1);
      assert.lengthOf((yield* read(agentThreadId)).messages, 1);
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
);

it.effect(
  "deduplicates simultaneous retries without retaining their unaccepted attachment copies",
  () =>
    Effect.gen(function* () {
      const { engine, dispatch, read } = yield* seed;
      const fs = yield* FileSystem.FileSystem;
      const config = yield* ServerConfig;
      const pendingId = createPendingAttachmentId("txt");
      const pendingPath = `${config.attachmentsDir}/${pendingId}.txt`;
      yield* fs.makeDirectory(config.attachmentsDir, { recursive: true });
      yield* fs.writeFileString(pendingPath, "abc");
      const request: AgentDelegateInput = {
        ...input,
        attachments: [
          { type: "file", id: pendingId, name: "notes.txt", mimeType: "text/plain", sizeBytes: 3 },
        ],
      };
      const bothPrepared = yield* Deferred.make<void>();
      const admit = yield* Deferred.make<void>();
      let preparedCount = 0;
      const concurrentDispatch = (command: OrchestrationCommand) =>
        Effect.gen(function* () {
          if (command.type === "thread.turn.start") {
            preparedCount++;
            if (preparedCount === 2) yield* Deferred.succeed(bothPrepared, undefined);
            yield* Deferred.await(admit);
          }
          return yield* dispatch(command);
        });
      const first = yield* delegateToPersistentAgent(request, concurrentDispatch).pipe(
        Effect.forkScoped,
      );
      const second = yield* delegateToPersistentAgent(request, concurrentDispatch).pipe(
        Effect.forkScoped,
      );
      yield* Deferred.await(bothPrepared);
      yield* Deferred.succeed(admit, undefined);
      yield* Fiber.join(first);
      yield* Fiber.join(second);
      const source = yield* read(sourceThreadId);
      const target = yield* read(agentThreadId);
      assert.lengthOf(source.messages, 1);
      assert.lengthOf(source.activities, 1);
      assert.lengthOf(target.messages, 1);
      const ownedFiles = [
        source.messages[0]!.attachments![0]!,
        target.messages[0]!.attachments![0]!,
      ].map((attachment) =>
        resolveAttachmentPath({ attachmentsDir: config.attachmentsDir, attachment })!
          .split("/")
          .at(-1)!,
      );
      assert.deepEqual(
        (yield* fs.readDirectory(config.attachmentsDir)).toSorted(),
        [`${pendingId}.txt`, ...ownedFiles].toSorted(),
      );
      const events = yield* Stream.runCollect(engine.readEvents(0));
      assert.lengthOf(
        events.filter((event) => event.type === "thread.turn-start-requested"),
        1,
      );
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
);

it.effect("keeps client-authored internal delegation context out of normal provider sends", () =>
  Effect.gen(function* () {
    yield* seed;
    const normalized = yield* normalizeDispatchCommand({
      type: "thread.turn.start",
      commandId: input.commandId,
      threadId: sourceThreadId,
      message: {
        messageId: input.messageId,
        role: "user",
        text: "Normal message",
        attachments: [],
        context: {
          version: 1,
          records: [
            {
              version: 1,
              kind: DELEGATION_SOURCE_CONTEXT_KIND,
              contextId: ComposerContextId.make("forged"),
              label: "Forged server provenance",
              payload: { attachments: [] },
            },
          ],
        },
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      createdAt: now,
    });
    assert.equal(normalized.type, "thread.turn.start");
    if (normalized.type === "thread.turn.start")
      assert.lengthOf(normalized.message.context!.records, 0);
  }).pipe(Effect.scoped, Effect.provide(testLayer)),
);

it.effect(
  "delegates one source request to multiple existing agents with one durable source message",
  () =>
    Effect.gen(function* () {
      const { dispatch, read } = yield* seed;
      const secondProjectId = ProjectId.make("edna-project");
      const secondThreadId = ThreadId.make("agent-edna-chat");
      yield* dispatch({
        type: "project.create",
        commandId: CommandId.make("create-edna"),
        projectId: secondProjectId,
        title: "Edna",
        workspaceRoot: "/workspaces/edna-project",
        agentProfile: { ...profile, conversationThreadId: secondThreadId },
        createdAt: now,
      });
      yield* dispatch({
        type: "thread.create",
        commandId: CommandId.make("create-edna-chat"),
        threadId: secondThreadId,
        projectId: secondProjectId,
        title: "Edna",
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdAt: now,
      });
      yield* delegateToPersistentAgent(input, dispatch);
      yield* delegateToPersistentAgent({ ...input, agentProjectId: secondProjectId }, dispatch);
      yield* delegateToPersistentAgent(input, dispatch);
      const source = yield* read(sourceThreadId);
      assert.lengthOf(source.messages, 1);
      assert.lengthOf(source.activities, 2);
      assert.lengthOf((yield* read(agentThreadId)).messages, 1);
      assert.lengthOf((yield* read(secondThreadId)).messages, 1);
      assert.notEqual(
        (yield* read(agentThreadId)).messages[0]?.id,
        (yield* read(secondThreadId)).messages[0]?.id,
      );
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
);

it.effect("reads only the delegated native turn's response after later unrelated work starts", () =>
  Effect.gen(function* () {
    const { dispatch, read } = yield* seed;
    yield* delegateToPersistentAgent(input, dispatch);
    const activity = (yield* read(sourceThreadId)).activities[0]!;
    const request = { sourceThreadId, activityId: activity.id };
    assert.equal((yield* getAgentDelegation(request)).status, "queued");
    const turnId = TurnId.make("friday-delegated-turn");
    yield* dispatch({
      type: "thread.session.set",
      commandId: CommandId.make("friday-started"),
      threadId: agentThreadId,
      session: {
        threadId: agentThreadId,
        status: "running",
        providerName: "claudeAgent",
        providerInstanceId: modelSelection.instanceId,
        runtimeMode: "full-access",
        activeTurnId: turnId,
        lastError: null,
        updatedAt: now,
      },
      createdAt: now,
    });
    yield* dispatch({
      type: "thread.message.assistant.delta",
      commandId: CommandId.make("friday-answer-delta"),
      threadId: agentThreadId,
      messageId: MessageId.make("friday-delegated-answer"),
      turnId,
      delta: "The requested release investigation is complete.",
      createdAt: now,
    });
    const working = yield* getAgentDelegation(request);
    assert.equal(working.status, "working");
    assert.lengthOf(working.messages, 1);
    yield* dispatch({
      type: "thread.message.assistant.complete",
      commandId: CommandId.make("friday-answer"),
      threadId: agentThreadId,
      messageId: MessageId.make("friday-delegated-answer"),
      turnId,
      createdAt: now,
    });
    yield* dispatch({
      type: "thread.session.set",
      commandId: CommandId.make("friday-finished"),
      threadId: agentThreadId,
      session: {
        threadId: agentThreadId,
        status: "ready",
        providerName: "claudeAgent",
        providerInstanceId: modelSelection.instanceId,
        runtimeMode: "full-access",
        activeTurnId: null,
        lastError: null,
        updatedAt: now,
      },
      createdAt: now,
    });
    const completed = yield* getAgentDelegation(request);
    assert.equal(completed.status, "completed");
    assert.equal(completed.targetTurnId, turnId);
    assert.deepEqual(
      completed.messages.map((message) => message.text),
      ["The requested release investigation is complete."],
    );
    yield* dispatch({
      type: "thread.turn.start",
      commandId: CommandId.make("friday-unrelated"),
      threadId: agentThreadId,
      message: {
        messageId: MessageId.make("unrelated-request"),
        role: "user",
        text: "Unrelated task",
        attachments: [],
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      createdAt: now,
    });
    const unrelatedTurn = TurnId.make("friday-unrelated-turn");
    yield* dispatch({
      type: "thread.session.set",
      commandId: CommandId.make("friday-unrelated-started"),
      threadId: agentThreadId,
      session: {
        threadId: agentThreadId,
        status: "running",
        providerName: "claudeAgent",
        providerInstanceId: modelSelection.instanceId,
        runtimeMode: "full-access",
        activeTurnId: unrelatedTurn,
        lastError: null,
        updatedAt: now,
      },
      createdAt: now,
    });
    yield* dispatch({
      type: "thread.message.assistant.delta",
      commandId: CommandId.make("unrelated-answer-delta"),
      threadId: agentThreadId,
      messageId: MessageId.make("unrelated-answer"),
      turnId: unrelatedTurn,
      delta: "Unrelated result must stay in the agent chat.",
      createdAt: now,
    });
    yield* dispatch({
      type: "thread.message.assistant.complete",
      commandId: CommandId.make("unrelated-answer"),
      threadId: agentThreadId,
      messageId: MessageId.make("unrelated-answer"),
      turnId: unrelatedTurn,
      createdAt: now,
    });
    const later = yield* getAgentDelegation(request);
    assert.equal(later.status, "completed");
    assert.equal(later.targetTurnId, turnId);
    assert.deepEqual(
      later.messages.map((message) => message.text),
      completed.messages.map((message) => message.text),
    );
    const wrongSource = yield* getAgentDelegation({
      ...request,
      sourceThreadId: agentThreadId,
    }).pipe(Effect.flip);
    assert.include(wrongSource.message, "unavailable");
  }).pipe(Effect.scoped, Effect.provide(testLayer)),
);

it.effect("preserves long delegated responses and reports omitted older response messages", () =>
  Effect.gen(function* () {
    const { dispatch, read } = yield* seed;
    yield* delegateToPersistentAgent(input, dispatch);
    const activity = (yield* read(sourceThreadId)).activities[0]!;
    const request = { sourceThreadId, activityId: activity.id };
    const turnId = TurnId.make("friday-long-answer-turn");
    yield* dispatch({
      type: "thread.session.set",
      commandId: CommandId.make("friday-long-answer-started"),
      threadId: agentThreadId,
      session: {
        threadId: agentThreadId,
        status: "running",
        providerName: "claudeAgent",
        providerInstanceId: modelSelection.instanceId,
        runtimeMode: "full-access",
        activeTurnId: turnId,
        lastError: null,
        updatedAt: now,
      },
      createdAt: now,
    });
    const longText = `${"Detailed findings.\n".repeat(5_000)}Complete final recommendation.`;
    for (let index = 0; index < 33; index++) {
      yield* dispatch({
        type: "thread.message.assistant.delta",
        commandId: CommandId.make(`long-answer-${index}`),
        threadId: agentThreadId,
        messageId: MessageId.make(`answer-${String(index).padStart(3, "0")}`),
        turnId,
        delta: index === 0 ? longText : `Response ${index}`,
        createdAt: now,
      });
      if (index === 0) {
        const first = yield* getAgentDelegation(request);
        assert.equal(first.messages[0]?.text, longText);
        assert.isFalse(first.truncated);
      }
    }
    const bounded = yield* getAgentDelegation(request);
    assert.lengthOf(bounded.messages, 32);
    assert.equal(bounded.messages[0]?.text, "Response 1");
    assert.equal(bounded.messages.at(-1)?.text, "Response 32");
    assert.isTrue(bounded.truncated);
  }).pipe(Effect.scoped, Effect.provide(testLayer)),
);

it.effect(
  "reports only the matching native-start failure after its pending binding is cleared",
  () =>
    Effect.gen(function* () {
      const { dispatch, read } = yield* seed;
      yield* delegateToPersistentAgent(input, dispatch);
      const activity = (yield* read(sourceThreadId)).activities[0]!;
      const request = { sourceThreadId, activityId: activity.id };
      const queued = yield* getAgentDelegation(request);
      yield* dispatch({
        type: "thread.activity.append",
        commandId: CommandId.make("unrelated-native-failure"),
        threadId: agentThreadId,
        activity: {
          id: EventId.make("unrelated-failure"),
          tone: "error",
          kind: "provider.turn.start.failed",
          summary: "Other task failed",
          payload: { requestId: "unrelated-request" },
          turnId: null,
          createdAt: now,
        },
        createdAt: now,
      });
      assert.equal((yield* getAgentDelegation(request)).status, "queued");
      yield* dispatch({
        type: "thread.activity.append",
        commandId: CommandId.make("delegated-native-failure"),
        threadId: agentThreadId,
        activity: {
          id: EventId.make("delegated-failure"),
          tone: "error",
          kind: "provider.turn.start.failed",
          summary: "Could not start the native task",
          payload: { requestId: queued.targetMessageId },
          turnId: null,
          createdAt: now,
        },
        createdAt: now,
      });
      const failed = yield* getAgentDelegation(request);
      assert.equal(failed.status, "error");
      assert.lengthOf(failed.messages, 0);
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
);

it.effect(
  "rejects a competing normal send at atomic admission without replacing its pending turn",
  () =>
    Effect.gen(function* () {
      const { dispatch, read } = yield* seed;
      let normalQueued = false;
      const error = yield* delegateToPersistentAgent(input, (command) =>
        Effect.gen(function* () {
          if (command.type === "thread.turn.start" && !normalQueued) {
            normalQueued = true;
            yield* dispatch({
              ...command,
              requireIdle: false,
              commandId: CommandId.make("competing-normal-send"),
              message: {
                messageId: MessageId.make("normal-message"),
                role: "user",
                text: "Existing normal send",
                attachments: [],
              },
            });
          }
          return yield* dispatch(command);
        }),
      ).pipe(Effect.flip);
      assert.include(error.message, "busy");
      assert.deepEqual(
        (yield* read(agentThreadId)).messages.map((message) => message.text),
        ["Existing normal send"],
      );
      assert.lengthOf((yield* read(sourceThreadId)).messages, 0);
      assert.lengthOf((yield* read(sourceThreadId)).activities, 0);
      const receipts = yield* OrchestrationCommandReceiptRepository;
      assert.isTrue(
        Option.isNone(
          yield* receipts.getByCommandId({
            commandId: CommandId.make(`agent-delegate:turn:${input.commandId}:${agentProjectId}`),
          }),
        ),
      );
      const turns = yield* ProjectionTurnRepository;
      yield* turns.deletePendingTurnStartByThreadId({ threadId: agentThreadId });
      yield* delegateToPersistentAgent(input, dispatch);
      assert.lengthOf((yield* read(sourceThreadId)).messages, 1);
      assert.lengthOf((yield* read(sourceThreadId)).activities, 1);
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
);

it.effect(
  "bounds transferred history without carrying reasoning, activities or provider state",
  () =>
    Effect.gen(function* () {
      const { dispatch, read } = yield* seed;
      for (let index = 0; index < 8; index++) {
        yield* dispatch({
          type: "thread.message.user.append",
          commandId: CommandId.make(`history-${index}`),
          threadId: sourceThreadId,
          message: {
            messageId: MessageId.make(`history-${index}`),
            text: `${index}: ${"large history ".repeat(1_000)}`,
            attachments: [],
          },
          createdAt: now,
        });
      }
      yield* delegateToPersistentAgent(input, dispatch);
      const text = (yield* read(agentThreadId)).messages[0]!.text;
      assert.isBelow(text.length, 13_000);
      assert.include(text, "7: large history");
      assert.notInclude(text, "0: large history");
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
);

it.effect("hands off only a bounded recent excerpt and the current request", () =>
  Effect.gen(function* () {
    const { dispatch, read } = yield* seed;
    for (const [index, text] of [
      "Old transcript content",
      "Recent first " + "a".repeat(3000),
      "Recent second " + "b".repeat(3000),
    ].entries()) {
      yield* dispatch({
        type: "thread.message.user.append",
        commandId: CommandId.make(`context-${index}`),
        threadId: sourceThreadId,
        message: { messageId: MessageId.make(`context-${index}`), text, attachments: [] },
        createdAt: now,
      });
    }
    yield* delegateToPersistentAgent(input, dispatch);
    const text = (yield* read(agentThreadId)).messages[0]!.text;
    assert.notInclude(text, "Old transcript content");
    const excerpt = text
      .split("Recent excerpt (reference only, limited to the last two messages):\n\n")[1]!
      .split("\n\nCurrent request:")[0]!;
    assert.include(excerpt, "Recent first");
    assert.include(excerpt, "Recent second");
    assert.isAtMost(excerpt.length, 4002);
    assert.include(text, "@Friday investigate the next release.");
  }).pipe(Effect.scoped, Effect.provide(testLayer)),
);

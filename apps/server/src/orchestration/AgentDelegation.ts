import {
  AgentDelegateInput,
  AgentDelegationActivityPayload,
  type AgentGetDelegationInput,
  type AgentGetDelegationResult,
  ChatAttachment,
  ComposerContextId,
  type AgentDelegateResult,
  type ClientOrchestrationCommand,
  CommandId,
  EventId,
  MessageId,
  type OrchestrationCommand,
  OrchestrationDispatchCommandError,
  type OrchestrationMessage,
} from "@t3tools/contracts";
import {
  projectComposerContextForProvider,
  replaceComposerContextReferences,
} from "@t3tools/shared/composerContextReferences";
import * as DateTime from "effect/DateTime";
import * as Crypto from "effect/Crypto";
import * as Encoding from "effect/Encoding";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { resolveAttachmentPath } from "../attachmentStore.ts";
import { ServerConfig } from "../config.ts";
import { OrchestrationCommandReceiptRepository } from "../persistence/Services/OrchestrationCommandReceipts.ts";
import { ProjectionTurnRepository } from "../persistence/Services/ProjectionTurns.ts";
import { ProjectionThreadMessageRepository } from "../persistence/Services/ProjectionThreadMessages.ts";
import { ProjectionThreadActivityRepository } from "../persistence/Services/ProjectionThreadActivities.ts";
import {
  cleanupFailedUploadedAttachments,
  normalizeDispatchCommand,
  DELEGATION_SOURCE_CONTEXT_KIND,
} from "./Normalizer.ts";
import { ProjectionSnapshotQuery } from "./Services/ProjectionSnapshotQuery.ts";

const HISTORY_MAX_CHARS = 4_000;
const SOURCE_FILES_KIND = DELEGATION_SOURCE_CONTEXT_KIND;
const SourceFiles = Schema.Struct({ attachments: Schema.Array(ChatAttachment) });
const encodeDelegateRequest = Schema.encodeEffect(Schema.fromJsonString(AgentDelegateInput));
const decodeSourceFiles = Schema.decodeUnknownOption(SourceFiles);
const decodeDelegationActivity = Schema.decodeUnknownOption(AgentDelegationActivityPayload);

const stripAgentRouting = (text: string) =>
  replaceComposerContextReferences(text, (reference) =>
    reference.kind === "agent" ? reference.label : reference.source,
  );

function recentContext(
  messages: ReadonlyArray<Pick<OrchestrationMessage, "role" | "text" | "attachments" | "context">>,
  attachmentsDir: string,
) {
  const entries: string[] = [];
  let remaining = HISTORY_MAX_CHARS;
  for (const message of messages
    .filter((message) => ["user", "assistant"].includes(message.role))
    .slice(-2)
    .toReversed()) {
    const text = projectComposerContextForProvider({
      text: stripAgentRouting(message.text),
      records: message.context?.records.filter((record) => !("payload" in record)) ?? [],
    });
    const references = (message.attachments ?? []).slice(0, 8).flatMap((attachment) => {
      const path = resolveAttachmentPath({ attachmentsDir, attachment });
      return path ? [`${attachment.name}: ${path}`] : [];
    });
    const entry = `${message.role}: ${text}\n${references.join("\n")}`.slice(
      0,
      Math.min(2_000, remaining),
    );
    entries.unshift(entry);
    remaining -= entry.length;
    if (remaining <= 0) break;
  }
  return entries.join("\n\n");
}

export const delegateToPersistentAgent = Effect.fn("delegateToPersistentAgent")(function* (
  input: AgentDelegateInput,
  dispatch: (
    command: OrchestrationCommand,
  ) => Effect.Effect<unknown, OrchestrationDispatchCommandError>,
) {
  const query = yield* ProjectionSnapshotQuery;
  const receipts = yield* OrchestrationCommandReceiptRepository;
  const turns = yield* ProjectionTurnRepository;
  const messageRepository = yield* ProjectionThreadMessageRepository;
  const config = yield* ServerConfig;
  const targetKey = `${input.commandId}:${input.agentProjectId}`;
  const targetCommandId = CommandId.make(`agent-delegate:turn:${targetKey}`);
  const targetMessageId = MessageId.make(
    `agent-delegate:${input.sourceThreadId}:${input.messageId}:${input.agentProjectId}`,
  );
  const readError = (cause: unknown) =>
    new OrchestrationDispatchCommandError({
      message: "Could not read the agent conversation. Try again.",
      cause,
    });
  const encodedRequest = yield* encodeDelegateRequest(input).pipe(Effect.mapError(readError));
  const fingerprint = yield* (yield* Crypto.Crypto)
    .digest("SHA-256", new TextEncoder().encode(encodedRequest))
    .pipe(Effect.map(Encoding.encodeHex), Effect.mapError(readError));
  const provenance = `[Elysia handoff sha256:${fingerprint}]`;
  const sourceFilesId = ComposerContextId.make(`handoff_source_${fingerprint}`);
  let preparedSource: Extract<OrchestrationCommand, { type: "thread.turn.start" }> | undefined;
  let sourcePreparationCommand:
    | Extract<ClientOrchestrationCommand, { type: "thread.turn.start" }>
    | undefined;
  let sourceCopyCreated = false;
  let preparedTarget:
    | {
        original: Extract<ClientOrchestrationCommand, { type: "thread.turn.start" }>;
        normalized: Extract<OrchestrationCommand, { type: "thread.turn.start" }>;
      }
    | undefined;
  const agentOption = yield* query
    .getProjectShellById(input.agentProjectId)
    .pipe(Effect.mapError(readError));
  if (Option.isNone(agentOption) || !agentOption.value.agentProfile?.conversationThreadId) {
    return yield* new OrchestrationDispatchCommandError({
      message: "This agent's linked chat is unavailable.",
    });
  }
  const agent = agentOption.value;
  const targetThreadId = agent.agentProfile!.conversationThreadId!;
  const result: AgentDelegateResult = { projectId: agent.id, threadId: targetThreadId };
  if (targetThreadId === input.sourceThreadId) {
    return yield* new OrchestrationDispatchCommandError({
      message: "You are already in this agent's chat. Send the message directly.",
    });
  }
  const sourceOption = yield* query
    .getThreadShellById(input.sourceThreadId)
    .pipe(Effect.mapError(readError));
  const targetOption = yield* query
    .getThreadShellById(targetThreadId)
    .pipe(Effect.mapError(readError));
  if (
    Option.isNone(sourceOption) ||
    Option.isNone(targetOption) ||
    targetOption.value.projectId !== agent.id ||
    targetOption.value.archivedAt !== null
  ) {
    return yield* new OrchestrationDispatchCommandError({
      message: "The source or agent chat is unavailable.",
    });
  }
  const receipt = yield* receipts
    .getByCommandId({ commandId: targetCommandId })
    .pipe(Effect.mapError(readError));
  if (
    Option.isSome(receipt) &&
    (receipt.value.aggregateKind !== "thread" || receipt.value.aggregateId !== targetThreadId)
  ) {
    return yield* new OrchestrationDispatchCommandError({
      message: "This handoff request was already used for another agent. Send a new request.",
    });
  }
  if (Option.isSome(receipt) && receipt.value.status !== "accepted") {
    return yield* new OrchestrationDispatchCommandError({
      message: "This handoff was rejected. Send a new request to retry.",
    });
  }
  if (Option.isNone(receipt)) {
    if (agent.agentProfile!.archived) {
      return yield* new OrchestrationDispatchCommandError({
        message: "Restore this agent before delegating work.",
      });
    }
    const target = targetOption.value;
    const pending = yield* turns
      .getPendingTurnStartByThreadId({ threadId: targetThreadId })
      .pipe(Effect.mapError(readError));
    if (
      Option.isSome(pending) ||
      target.latestTurn?.state === "running" ||
      target.session?.status === "starting" ||
      target.session?.status === "running" ||
      target.hasPendingApprovals ||
      target.hasPendingUserInput ||
      target.backgroundLiveness === "working"
    ) {
      return yield* new OrchestrationDispatchCommandError({
        message: `${agent.title} is busy. Wait for their current task to finish, then try again.`,
      });
    }
    if (!input.text.trim() && !input.attachments?.length) {
      return yield* new OrchestrationDispatchCommandError({
        message: "Add a task or attachment to delegate.",
      });
    }
    const sourceProject = yield* query
      .getProjectShellById(sourceOption.value.projectId)
      .pipe(Effect.mapError(readError));
    const sourceMessages = yield* messageRepository
      .listByThreadId({ threadId: input.sourceThreadId, limit: 3 })
      .pipe(Effect.mapError(readError));
    if (Option.isNone(sourceProject)) {
      return yield* new OrchestrationDispatchCommandError({
        message: "The originating conversation is unavailable.",
      });
    }
    const existingSourceMessage = yield* query
      .getTurnStartMessage({
        threadId: input.sourceThreadId,
        messageId: input.messageId,
      })
      .pipe(Effect.mapError(readError));
    const existingSourceReceipt = yield* receipts
      .getByCommandId({ commandId: CommandId.make(`agent-delegate:source:${input.commandId}`) })
      .pipe(Effect.mapError(readError));
    if (
      Option.isSome(existingSourceMessage) &&
      (Option.isNone(existingSourceReceipt) ||
        existingSourceReceipt.value.status !== "accepted" ||
        existingSourceReceipt.value.aggregateId !== input.sourceThreadId ||
        existingSourceMessage.value.message.text !== input.text)
    ) {
      return yield* new OrchestrationDispatchCommandError({
        message: "This message was already sent. Start a new handoff request.",
      });
    }
    const createdAt = DateTime.formatIso(yield* DateTime.now);
    sourcePreparationCommand = {
      type: "thread.turn.start",
      commandId: CommandId.make(`agent-delegate:source:${input.commandId}`),
      threadId: input.sourceThreadId,
      message: {
        messageId: input.messageId,
        role: "user",
        text: input.text,
        attachments: input.attachments ?? [],
        ...(input.context
          ? {
              context: {
                ...input.context,
                records: input.context.records.filter(
                  (record) => record.kind !== SOURCE_FILES_KIND,
                ),
              },
            }
          : {}),
      },
      runtimeMode: sourceOption.value.runtimeMode,
      interactionMode: sourceOption.value.interactionMode,
      createdAt,
    };
    const reuseSource =
      Option.isSome(existingSourceMessage) &&
      Option.isSome(existingSourceReceipt) &&
      existingSourceReceipt.value.status === "accepted";
    const normalizedSource =
      reuseSource && Option.isSome(existingSourceMessage)
        ? {
            ...sourcePreparationCommand,
            message: {
              ...sourcePreparationCommand.message,
              attachments: existingSourceMessage.value.message.attachments ?? [],
              ...(existingSourceMessage.value.message.context
                ? { context: existingSourceMessage.value.message.context }
                : {}),
            },
          }
        : yield* normalizeDispatchCommand(sourcePreparationCommand);
    if (normalizedSource.type !== "thread.turn.start") {
      return yield* new OrchestrationDispatchCommandError({
        message: "Could not prepare the source request.",
      });
    }
    preparedSource = normalizedSource;
    sourceCopyCreated = !reuseSource;
    const command: Extract<ClientOrchestrationCommand, { type: "thread.turn.start" }> = {
      type: "thread.turn.start",
      commandId: targetCommandId,
      threadId: targetThreadId,
      message: {
        messageId: targetMessageId,
        role: "user",
        text: [
          provenance,
          "A task was delegated to you from another Elysia chat.",
          `Origin chat: ${input.sourceThreadId}`,
          `Origin workspace (reference only): ${sourceOption.value.worktreePath ?? sourceProject.value.workspaceRoot}`,
          "Continue in your own agent chat, workspace and memory. The originating workspace and transcript are references; they do not change your working directory.",
          "Before using tools, send a separate, brief assistant message summarising what you understand the current request to be. Start that message with **Task:**. Then carry out the task and send the result in a subsequent assistant message. Do not repeat the delegation instructions or narrate the handoff.",
          "Recent excerpt (reference only, limited to the last two messages):",
          recentContext(
            sourceMessages.filter((message) => message.messageId !== input.messageId),
            config.attachmentsDir,
          ),
          "Current request:",
          stripAgentRouting(input.text),
        ].join("\n\n"),
        attachments: preparedSource.message.attachments,
        context: {
          version: 1,
          records: [
            ...(preparedSource.message.context?.records ?? []),
            // Unreferenced server provenance: provider projection never emits this record.
            {
              version: 1,
              kind: SOURCE_FILES_KIND,
              contextId: sourceFilesId,
              label: "Original request attachments",
              payload: {
                handoff: {
                  sourceThreadId: input.sourceThreadId,
                  sourceThreadTitle: sourceOption.value.title,
                  ask: stripAgentRouting(input.text),
                },
                attachments: preparedSource.message.attachments.map(
                  ({ id, type, name, mimeType, sizeBytes }) => ({
                    id,
                    type,
                    name,
                    mimeType,
                    sizeBytes,
                  }),
                ),
              },
            },
          ],
        },
      },
      runtimeMode: target.runtimeMode,
      interactionMode: target.interactionMode,
      createdAt,
    };
    // Normal upload claiming gives the agent its own durable files and rewrites chip ids.
    const normalized = yield* normalizeDispatchCommand(command, {
      allowClaimedAttachments: true,
      preserveDelegationContext: true,
    }).pipe(
      Effect.tapError(() =>
        Option.isSome(existingSourceReceipt) && existingSourceReceipt.value.status === "accepted"
          ? Effect.void
          : cleanupFailedUploadedAttachments(sourcePreparationCommand!, preparedSource!, {
              allowClaimedAttachments: true,
            }),
      ),
    );
    if (normalized.type !== "thread.turn.start") {
      return yield* new OrchestrationDispatchCommandError({
        message: "Could not prepare the agent task.",
      });
    }
    preparedTarget = { original: command, normalized };
    yield* dispatch({ ...normalized, requireIdle: true }).pipe(
      Effect.tapError(() =>
        receipts.getByCommandId({ commandId: targetCommandId }).pipe(
          Effect.flatMap((receipt) =>
            Option.isSome(receipt) && receipt.value.status === "accepted"
              ? Effect.void
              : Effect.all([
                  cleanupFailedUploadedAttachments(command, normalized, {
                    allowClaimedAttachments: true,
                  }),
                  Option.isSome(existingSourceReceipt) &&
                  existingSourceReceipt.value.status === "accepted"
                    ? Effect.void
                    : cleanupFailedUploadedAttachments(sourcePreparationCommand!, preparedSource!, {
                        allowClaimedAttachments: true,
                      }),
                ]).pipe(Effect.asVoid),
          ),
          Effect.ignore,
        ),
      ),
    );
  }

  // The accepted target message also supplies attachment/context ids on a resumed retry.
  const accepted = yield* query
    .getTurnStartMessage({ threadId: targetThreadId, messageId: targetMessageId })
    .pipe(Effect.mapError(readError));
  if (Option.isNone(accepted)) {
    return yield* new OrchestrationDispatchCommandError({
      message: "The handoff receipt does not match this request. Send a new request.",
    });
  }
  if (!accepted.value.message.text.startsWith(`${provenance}\n\n`)) {
    return yield* new OrchestrationDispatchCommandError({
      message: "This handoff request was already used for a different task. Send a new request.",
    });
  }
  const sourceRecord = accepted.value.message.context?.records.find(
    (record) =>
      record.kind === SOURCE_FILES_KIND &&
      record.contextId === sourceFilesId &&
      "payload" in record,
  );
  const sourceFiles =
    sourceRecord && "payload" in sourceRecord
      ? decodeSourceFiles(sourceRecord.payload)
      : Option.none();
  if (Option.isNone(sourceFiles)) {
    return yield* new OrchestrationDispatchCommandError({
      message: "The original delegated attachments are unavailable.",
    });
  }
  // Concurrent retries can prepare different copies before the engine dedups
  // their command. Only the accepted message's files have durable ownership.
  const acceptedTargetIds = new Set(accepted.value.message.attachments?.map(({ id }) => id));
  if (
    preparedTarget &&
    preparedTarget.normalized.message.attachments.every(({ id }) => !acceptedTargetIds.has(id))
  ) {
    yield* cleanupFailedUploadedAttachments(preparedTarget.original, preparedTarget.normalized, {
      allowClaimedAttachments: true,
    });
  }
  const acceptedSourceIds = new Set(sourceFiles.value.attachments.map(({ id }) => id));
  if (
    sourceCopyCreated &&
    preparedSource &&
    sourcePreparationCommand &&
    preparedSource.message.attachments.every(({ id }) => !acceptedSourceIds.has(id))
  ) {
    yield* cleanupFailedUploadedAttachments(sourcePreparationCommand, preparedSource, {
      allowClaimedAttachments: true,
    });
  }
  const createdAt = DateTime.formatIso(yield* DateTime.now);
  const sourceCommandId = CommandId.make(`agent-delegate:source:${input.commandId}`);
  const sourceReceipt = yield* receipts
    .getByCommandId({ commandId: sourceCommandId })
    .pipe(Effect.mapError(readError));
  if (
    Option.isSome(sourceReceipt) &&
    (sourceReceipt.value.aggregateKind !== "thread" ||
      sourceReceipt.value.aggregateId !== input.sourceThreadId)
  ) {
    return yield* new OrchestrationDispatchCommandError({
      message: "This handoff request was already used in another source chat.",
    });
  }
  if (Option.isNone(sourceReceipt) || sourceReceipt.value.status !== "accepted") {
    const finalIdByClientId = new Map(
      input.attachments?.flatMap((attachment, index) =>
        attachment.id && sourceFiles.value.attachments[index]
          ? [[attachment.id, sourceFiles.value.attachments[index]!.id] as const]
          : [],
      ),
    );
    const sourceAttachments = sourceFiles.value.attachments.map((attachment, index) => {
      const original = input.attachments?.[index];
      return original && "source" in original && original.source
        ? { ...attachment, source: original.source }
        : attachment;
    });
    const sourceContext = input.context
      ? {
          ...input.context,
          records: input.context.records
            .filter((record) => record.kind !== SOURCE_FILES_KIND)
            .map((record) =>
              (record.kind === "image" || record.kind === "file") && "attachmentId" in record
                ? {
                    ...record,
                    attachmentId: finalIdByClientId.get(record.attachmentId) ?? record.attachmentId,
                  }
                : record,
            ),
        }
      : undefined;
    yield* dispatch({
      type: "thread.message.user.append",
      commandId: sourceCommandId,
      threadId: input.sourceThreadId,
      message: {
        messageId: input.messageId,
        text: input.text,
        attachments: sourceAttachments,
        ...(sourceContext ? { context: sourceContext } : {}),
      },
      createdAt,
    });
  }
  yield* dispatch({
    type: "thread.activity.append",
    commandId: CommandId.make(`agent-delegate:ack:${targetKey}`),
    threadId: input.sourceThreadId,
    activity: {
      id: EventId.make(`agent-delegate:ack:${targetKey}`),
      tone: "info",
      kind: "agent.delegated",
      summary: `${agent.title}: I got it. I’ll continue in my chat.`,
      payload: {
        agentProjectId: agent.id,
        agentThreadId: targetThreadId,
        agentName: agent.title,
        sourceMessageId: input.messageId,
        targetMessageId,
        targetTurnId: accepted.value.message.turnId,
      },
      turnId: null,
      createdAt,
    },
    createdAt,
  });
  return result;
});

export const getAgentDelegation = Effect.fn("getAgentDelegation")(function* (
  input: AgentGetDelegationInput,
) {
  const activities = yield* ProjectionThreadActivityRepository;
  const turns = yield* ProjectionTurnRepository;
  const messages = yield* ProjectionThreadMessageRepository;
  const query = yield* ProjectionSnapshotQuery;
  const readError = (cause: unknown) =>
    new OrchestrationDispatchCommandError({
      message: "Could not read the delegated task. Try again.",
      cause,
    });
  const activity = (yield* activities
    .listByThreadId({
      threadId: input.sourceThreadId,
      activityId: input.activityId,
      activityKinds: ["agent.delegated"],
      limit: 1,
    })
    .pipe(Effect.mapError(readError)))[0];
  const payload = activity ? decodeDelegationActivity(activity.payload) : Option.none();
  if (Option.isNone(payload)) {
    return yield* new OrchestrationDispatchCommandError({
      message: "This delegated task is unavailable in the source chat.",
    });
  }
  const { sourceMessageId: _sourceMessageId, ...identity } = payload.value;
  const base: AgentGetDelegationResult = {
    ...identity,
    status: "unavailable",
    messages: [],
    truncated: false,
  };
  const agent = yield* query
    .getProjectShellById(identity.agentProjectId)
    .pipe(Effect.mapError(readError));
  const target = yield* query
    .getThreadShellById(identity.agentThreadId)
    .pipe(Effect.mapError(readError));
  if (
    Option.isNone(agent) ||
    agent.value.agentProfile?.conversationThreadId !== identity.agentThreadId ||
    Option.isNone(target) ||
    target.value.projectId !== identity.agentProjectId
  )
    return base;
  const turn = yield* turns
    .getByPendingMessageId({
      threadId: identity.agentThreadId,
      messageId: identity.targetMessageId,
    })
    .pipe(Effect.mapError(readError));
  if (Option.isNone(turn)) {
    const failed = yield* activities
      .listByThreadId({
        threadId: identity.agentThreadId,
        requestId: identity.targetMessageId,
        activityKinds: ["provider.turn.start.failed"],
        limit: 1,
      })
      .pipe(Effect.mapError(readError));
    return failed.length ? { ...base, status: "error" as const } : base;
  }
  const targetTurnId = turn.value.turnId;
  const status: AgentGetDelegationResult["status"] =
    turn.value.state === "pending"
      ? "queued"
      : turn.value.state === "running"
        ? target.value.session?.activeTurnId === targetTurnId &&
          (target.value.hasPendingApprovals || target.value.hasPendingUserInput)
          ? "waiting"
          : "working"
        : turn.value.state;
  const rows = targetTurnId
    ? yield* messages
        .listByThreadId({
          threadId: identity.agentThreadId,
          turnId: targetTurnId,
          role: "assistant",
          limit: 33,
        })
        .pipe(Effect.mapError(readError))
    : [];
  const response: OrchestrationMessage[] = rows.slice(-32).map((row) => ({
    id: row.messageId,
    role: row.role,
    text: row.text,
    turnId: row.turnId,
    streaming: row.isStreaming,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.attachments ? { attachments: row.attachments } : {}),
    ...(row.context ? { context: row.context } : {}),
  }));
  return {
    ...identity,
    targetTurnId,
    status,
    messages: response,
    truncated: rows.length > 32,
  } satisfies AgentGetDelegationResult;
});

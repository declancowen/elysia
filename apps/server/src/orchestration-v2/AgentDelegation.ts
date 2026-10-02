import {
  AgentDelegateInput,
  type AgentGetDelegationInput,
  type AgentGetDelegationResult,
  type AgentDelegateResult,
  ChatAttachment,
  IsoDateTime,
  OrchestrationMessage,
  OrchestrationMessageContext,
  CommandId,
  ComposerContextId,
  EventId,
  MessageId,
  TurnId,
  TurnItemId,
  RunId,
  OrchestrationDispatchCommandError,
  OrchestrationV2ConversationMessageJson,
  OrchestrationV2TurnItemJson,
  type OrchestrationV2ConversationMessage,
  type OrchestrationV2DomainEvent,
} from "@t3tools/contracts";
import {
  replaceComposerContextReferences,
  remapComposerContextAttachments,
} from "@t3tools/shared/composerContextReferences";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Encoding from "effect/Encoding";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Scheduler from "../scheduling/Scheduler.ts";
import * as AttachmentClaims from "./AttachmentClaims.ts";
import * as CommandReceiptStore from "./CommandReceiptStore.ts";
import * as EventSink from "./EventSink.ts";
import * as ProjectStore from "./ProjectStore.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ThreadMessageIntake from "./ThreadMessageIntake.ts";
import * as ThreadManagement from "./ThreadManagementService.ts";
import * as ThreadCommandExecutor from "./ThreadCommandExecutor.ts";

const fail = (message: string, cause?: unknown) =>
  new OrchestrationDispatchCommandError({ message, ...(cause === undefined ? {} : { cause }) });
const readError = (cause: unknown) =>
  fail("Could not read the agent conversation. Try again.", cause);
const encodeRequest = Schema.encodeEffect(Schema.fromJsonString(AgentDelegateInput));
const decodeMessage = Schema.decodeUnknownEffect(
  Schema.fromJsonString(OrchestrationV2ConversationMessageJson),
);
const decodeAttachments = Schema.decodeUnknownEffect(Schema.Array(ChatAttachment));
const decodeTurnItem = Schema.decodeUnknownEffect(
  Schema.fromJsonString(OrchestrationV2TurnItemJson),
);
const decodeLegacyAttachments = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Array(ChatAttachment)),
);
const decodeLegacyContext = Schema.decodeUnknownEffect(
  Schema.fromJsonString(OrchestrationMessageContext),
);
const decodeLegacyMessage = Schema.decodeUnknownEffect(OrchestrationMessage);
const SOURCE_FILES_KIND = "elysia-agent-delegation-source";
const SourceCutoff = Schema.Struct({
  runOrdinal: Schema.Int,
  turnItemOrdinal: Schema.Int,
  requestedAt: IsoDateTime,
});
const decodeSource = Schema.decodeUnknownOption(
  Schema.Struct({ attachments: Schema.Array(ChatAttachment), sourceCutoff: SourceCutoff }),
);
const stripRouting = (text: string) =>
  replaceComposerContextReferences(text, (reference) =>
    reference.kind === "agent" ? reference.label : reference.source,
  );

// Both history and reply reads are bounded in SQL before decoding transcript payloads.
const readMessages = Effect.fn("AgentDelegation.readMessages")(function* (
  threadId: string,
  runId?: string,
  limit = 33,
) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ payload_json: string }>`
    SELECT payload_json FROM orchestration_v2_projection_messages
    WHERE thread_id = ${threadId} AND ${runId === undefined ? sql`role IN ('user', 'assistant')` : sql`role = 'assistant'`}
      ${runId === undefined ? sql`` : sql`AND run_id = ${runId}`}
    ORDER BY created_at DESC, message_id DESC LIMIT ${limit}
  `;
  return yield* Effect.forEach(rows.toReversed(), (row) => decodeMessage(row.payload_json));
});

const delegateToPersistentAgentImpl = Effect.fn("delegateToPersistentAgent")(function* (
  input: AgentDelegateInput,
) {
  const projects = yield* ProjectStore.ProjectStoreV2;
  const threads = yield* ThreadManagement.ThreadManagementService;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const receipts = yield* CommandReceiptStore.CommandReceiptStoreV2;
  const sink = yield* EventSink.EventSinkV2;
  const commands = yield* ThreadCommandExecutor.ThreadCommandExecutor;
  const incoming = yield* decodeAttachments(input.attachments ?? []).pipe(
    Effect.mapError(readError),
  );
  const agentOption = yield* projects.get(input.agentProjectId).pipe(Effect.mapError(readError));
  if (Option.isNone(agentOption) || !agentOption.value.agentProfile?.conversationThreadId) {
    return yield* fail("This agent's linked chat is unavailable.");
  }
  const agent = agentOption.value;
  const targetThreadId = agent.agentProfile!.conversationThreadId!;
  if (targetThreadId === input.sourceThreadId)
    return yield* fail("You are already in this agent's chat. Send the message directly.");
  const source = yield* threads
    .getThreadShell(input.sourceThreadId)
    .pipe(Effect.mapError(readError));
  const target = yield* threads.getThreadShell(targetThreadId).pipe(Effect.mapError(readError));
  if (
    !source ||
    !target ||
    source.deletedAt !== null ||
    target.deletedAt !== null ||
    target.archivedAt !== null ||
    target.projectId !== agent.projectId
  ) {
    return yield* fail("The source or agent chat is unavailable.");
  }
  const sourceProject = yield* projects.get(source.projectId).pipe(Effect.mapError(readError));
  if (
    Option.isNone(sourceProject) ||
    sourceProject.value.deletedAt !== null ||
    source.archivedAt !== null ||
    sourceProject.value.agentProfile?.archived
  )
    return yield* fail("The source chat is unavailable.");
  const sourceRecords = yield* projections
    .getThreadRecords(input.sourceThreadId, ["messages"], { messageIds: [input.messageId] })
    .pipe(Effect.mapError(readError));
  const existingRequest = sourceRecords.messages[0];
  if (existingRequest && (existingRequest.role !== "user" || existingRequest.text !== input.text))
    return yield* fail("This request message was already used for a different task.");
  const key = `${input.commandId}:${input.agentProjectId}`;
  const targetCommandId = CommandId.make(`agent-delegate:turn:${key}`);
  const targetMessageId = MessageId.make(
    `agent-delegate:${input.sourceThreadId}:${input.messageId}:${input.agentProjectId}`,
  );
  const fingerprint = yield* encodeRequest(input).pipe(
    Effect.flatMap((encoded) => yieldCryptoDigest(encoded)),
    Effect.mapError(readError),
  );
  const provenance = `[Elysia handoff sha256:${fingerprint}]`;
  const receipt = yield* receipts.getByCommandId(targetCommandId).pipe(Effect.mapError(readError));
  let accepted: OrchestrationV2ConversationMessage | undefined;
  let sourceAttachments: ReadonlyArray<ChatAttachment> = [];
  let preparedSource: AttachmentClaims.ClaimedAttachments | undefined;
  let preparedTarget: AttachmentClaims.ClaimedAttachments | undefined;
  if (Option.isSome(receipt)) {
    if (receipt.value.threadId !== targetThreadId || receipt.value.status !== "accepted")
      return yield* fail("This handoff request was already used or rejected. Send a new request.");
    const records = yield* projections
      .getThreadRecords(targetThreadId, ["messages"], { messageIds: [targetMessageId] })
      .pipe(Effect.mapError(readError));
    accepted = records.messages[0];
    if (!accepted?.text.startsWith(`${provenance}\n\n`))
      return yield* fail(
        "This handoff request was already used for a different task. Send a new request.",
      );
    // Source copies are already durable if the acknowledgment committed. A retry does not claim them again.
  } else {
    if (agent.agentProfile?.archived)
      return yield* fail("Restore this agent before delegating work.");
    if (!input.text.trim() && !input.attachments?.length)
      return yield* fail("Add a task or attachment to delegate.");
    // Sample caller ownership before entering the target's queue. The target's
    // accepted context retains this cutoff so a retry cannot adopt newer user work.
    const sourceCutoff = yield* commands.withLock(
      input.sourceThreadId,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const retained = yield* sql<{ payload_json: string }>`SELECT payload_json
          FROM orchestration_v2_projection_turn_items
          WHERE thread_id = ${input.sourceThreadId} AND type = 'system_notice'
            AND json_extract(payload_json, '$.agentDelegation.sourceMessageId') = ${input.messageId}
            AND json_extract(payload_json, '$.agentDelegation.sourceTurnItemOrdinal') IS NOT NULL
            AND json_extract(payload_json, '$.agentDelegation.sourceRunOrdinal') IS NOT NULL
            AND json_extract(payload_json, '$.agentDelegation.sourceRequestedAt') IS NOT NULL
          ORDER BY ordinal LIMIT 1`.pipe(Effect.mapError(readError));
        if (retained[0]) {
          const notice = yield* decodeTurnItem(retained[0].payload_json).pipe(
            Effect.mapError(readError),
          );
          if (notice.type === "system_notice" && notice.agentDelegation) {
            const identity = notice.agentDelegation;
            return {
              runOrdinal: identity.sourceRunOrdinal!,
              turnItemOrdinal: identity.sourceTurnItemOrdinal!,
              requestedAt: identity.sourceRequestedAt!,
            };
          }
        }
        const original = yield* projections
          .getThreadRecords(input.sourceThreadId, ["messages"], {
            messageIds: [input.messageId],
          })
          .pipe(Effect.mapError(readError));
        const rows = yield* sql<{
          runOrdinal: number;
          turnItemOrdinal: number;
          originalRunOrdinal: number | null;
          originalItemOrdinal: number | null;
        }>`SELECT
        (SELECT COALESCE(MAX(ordinal), 0) FROM orchestration_v2_projection_runs WHERE thread_id = ${input.sourceThreadId}) AS runOrdinal,
        (SELECT COALESCE(MAX(ordinal), 0) FROM orchestration_v2_projection_turn_items WHERE thread_id = ${input.sourceThreadId}) AS turnItemOrdinal,
        (SELECT run.ordinal FROM orchestration_v2_projection_runs run JOIN orchestration_v2_projection_messages message ON message.run_id = run.run_id AND message.thread_id = run.thread_id WHERE message.thread_id = ${input.sourceThreadId} AND message.message_id = ${input.messageId}) AS originalRunOrdinal,
        (SELECT ordinal FROM orchestration_v2_projection_turn_items WHERE thread_id = ${input.sourceThreadId} AND type = 'user_message' AND json_extract(payload_json, '$.messageId') = ${input.messageId} ORDER BY ordinal LIMIT 1) AS originalItemOrdinal`.pipe(
          Effect.mapError(readError),
        );
        return {
          runOrdinal: rows[0]?.originalRunOrdinal ?? rows[0]?.runOrdinal ?? 0,
          turnItemOrdinal: rows[0]?.originalItemOrdinal ?? rows[0]?.turnItemOrdinal ?? 0,
          requestedAt: DateTime.formatIso(original.messages[0]?.createdAt ?? (yield* DateTime.now)),
        };
      }),
    );
    const sourceClaim = yield* AttachmentClaims.claimPendingAttachments({
      threadId: input.sourceThreadId,
      attachments: incoming,
    }).pipe(Effect.mapError(readError));
    sourceAttachments = sourceClaim.attachments;
    preparedSource = sourceClaim;
    const targetClaim = yield* AttachmentClaims.claimPendingAttachments({
      threadId: targetThreadId,
      attachments: sourceAttachments,
      allowClaimedAttachments: true,
    }).pipe(
      Effect.tapError(() => AttachmentClaims.releaseClaimedAttachments(sourceClaim.claimedPaths)),
      Effect.mapError(readError),
    );
    preparedTarget = targetClaim;
    const recent = yield* readMessages(input.sourceThreadId, undefined, 2).pipe(
      Effect.mapError(readError),
    );
    const text = [
      provenance,
      "A task was delegated to you from another Elysia chat.",
      `Origin chat: ${input.sourceThreadId}`,
      `Origin workspace (reference only): ${source.worktreePath ?? sourceProject.value.workspaceRoot}`,
      "Continue in your own agent chat, workspace and memory. The originating workspace and transcript are references; they do not change your working directory.",
      "Before using tools, send a separate, brief assistant message summarising the current request. Start it with **Task:**. Carry out the task and send the result in a subsequent response.",
      "Recent excerpt (reference only):",
      recent
        .map((message) => `${message.role}: ${stripRouting(message.text).slice(-2000)}`)
        .join("\n\n"),
      "Current request:",
      stripRouting(input.text),
    ].join("\n\n");
    yield* ThreadMessageIntake.dispatchCommand({
      type: "message.dispatch",
      commandId: targetCommandId,
      threadId: targetThreadId,
      messageId: targetMessageId,
      text,
      attachments: targetClaim.attachments,
      context: {
        version: 1,
        records: [
          ...(input.context
            ? (
                remapComposerContextAttachments(input.context, incoming, targetClaim.attachments)
                  ?.records ?? []
              ).filter((record) => record.kind !== SOURCE_FILES_KIND)
            : []),
          {
            version: 1,
            kind: SOURCE_FILES_KIND,
            contextId: ComposerContextId.make(`handoff_source_${fingerprint}`),
            label: "Original request attachments",
            payload: {
              sourceCutoff,
              attachments: sourceAttachments,
              handoff: {
                sourceThreadId: input.sourceThreadId,
                sourceThreadTitle: source.title,
                ask: stripRouting(input.text),
              },
            },
          },
        ],
      },
      createdBy: "user",
      creationSource: "web",
      dispatchMode: { type: "queue_after_active" },
      senderThreadId: input.sourceThreadId,
    }).pipe(
      Effect.tapError(() =>
        receipts.getByCommandId(targetCommandId).pipe(
          Effect.flatMap((result) =>
            Option.isSome(result) && result.value.status === "accepted"
              ? Effect.void
              : AttachmentClaims.releaseClaimedAttachments([
                  ...sourceClaim.claimedPaths,
                  ...targetClaim.claimedPaths,
                ]),
          ),
          Effect.ignore,
        ),
      ),
      Effect.mapError(readError),
    );
    const records = yield* projections
      .getThreadRecords(targetThreadId, ["messages"], { messageIds: [targetMessageId] })
      .pipe(Effect.mapError(readError));
    accepted = records.messages[0];
  }
  if (!accepted?.runId) return yield* fail("The agent task has no accepted run. Try again.");
  const sourceRecord = accepted.context?.records.find(
    (record) => record.kind === SOURCE_FILES_KIND && "payload" in record,
  );
  const original =
    sourceRecord && "payload" in sourceRecord ? decodeSource(sourceRecord.payload) : Option.none();
  if (Option.isNone(original))
    return yield* fail("The original delegated attachments are unavailable.");
  sourceAttachments = original.value.attachments;
  // A concurrent idempotent retry can prepare copies that the accepted message never owns.
  if (
    preparedTarget &&
    preparedTarget.attachments.every(
      (item) => !accepted!.attachments.some((retained) => retained.id === item.id),
    )
  )
    yield* AttachmentClaims.releaseClaimedAttachments(preparedTarget.claimedPaths);
  if (
    preparedSource &&
    preparedSource.attachments.every(
      (item) => !sourceAttachments.some((retained) => retained.id === item.id),
    )
  )
    yield* AttachmentClaims.releaseClaimedAttachments(preparedSource.claimedPaths);

  const identity = {
    agentProjectId: agent.projectId,
    agentThreadId: targetThreadId,
    agentName: agent.title,
    sourceMessageId: input.messageId,
    sourceRunOrdinal: original.value.sourceCutoff.runOrdinal,
    sourceTurnItemOrdinal: original.value.sourceCutoff.turnItemOrdinal,
    sourceRequestedAt: original.value.sourceCutoff.requestedAt,
    targetMessageId,
    targetTurnId: TurnId.make(accepted.runId),
  };
  const requestedAt = DateTime.makeUnsafe(original.value.sourceCutoff.requestedAt);
  const ackId = EventId.make(`agent-delegate:ack:${key}`);
  const sourceCommandId = CommandId.make(`agent-delegate:source:${key}`);
  yield* commands.withLock(
    input.sourceThreadId,
    Effect.gen(function* () {
      const sourceReceipt = yield* receipts
        .getByCommandId(sourceCommandId)
        .pipe(Effect.mapError(readError));
      if (Option.isSome(sourceReceipt)) {
        if (
          sourceReceipt.value.threadId !== input.sourceThreadId ||
          sourceReceipt.value.status !== "accepted"
        )
          return yield* fail("This handoff acknowledgment belongs to another conversation.");
        return;
      }
      const sourceRecords = yield* projections
        .getThreadRecords(input.sourceThreadId, ["messages"], { messageIds: [input.messageId] })
        .pipe(Effect.mapError(readError));
      if (sourceRecords.messages.length && sourceRecords.messages[0]?.text !== input.text)
        return yield* fail("This message id was already used for another request.");
      const at = yield* DateTime.now;
      const base = { threadId: input.sourceThreadId, occurredAt: at };
      const events: OrchestrationV2DomainEvent[] = [];
      if (!sourceRecords.messages.length) {
        // The source keeps a request record without starting a second agent run.
        events.push({
          ...base,
          id: EventId.make(`${ackId}:request`),
          type: "message.updated",
          payload: {
            id: input.messageId,
            threadId: input.sourceThreadId,
            runId: null,
            nodeId: null,
            role: "user",
            text: input.text,
            attachments: sourceAttachments,
            ...(input.context
              ? {
                  context: remapComposerContextAttachments(
                    input.context,
                    incoming,
                    sourceAttachments,
                  ),
                }
              : {}),
            streaming: false,
            createdAt: requestedAt,
            updatedAt: requestedAt,
            createdBy: "user",
            creationSource: "web",
          },
        });
        events.push({
          ...base,
          id: EventId.make(`${ackId}:request-item`),
          type: "turn-item.updated",
          payload: {
            id: TurnItemId.make(`${ackId}:request-item`),
            threadId: input.sourceThreadId,
            runId: null,
            nodeId: null,
            providerThreadId: null,
            providerTurnId: null,
            nativeItemRef: null,
            parentItemId: null,
            ordinal: 0,
            status: "completed",
            title: null,
            startedAt: requestedAt,
            completedAt: requestedAt,
            updatedAt: requestedAt,
            type: "user_message",
            messageId: input.messageId,
            text: input.text,
            attachments: sourceAttachments,
            ...(input.context
              ? {
                  context: remapComposerContextAttachments(
                    input.context,
                    incoming,
                    sourceAttachments,
                  ),
                }
              : {}),
            createdBy: "user",
            creationSource: "web",
            inputIntent: "turn_start",
          },
        });
      }
      events.push({
        ...base,
        id: ackId,
        type: "turn-item.updated",
        payload: {
          id: TurnItemId.make(ackId),
          threadId: input.sourceThreadId,
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
          type: "system_notice",
          message: `${agent.title}: I got it. I’ll continue in my chat.`,
          agentDelegation: identity,
        },
      });
      yield* sink
        .commitCommand({
          commandId: sourceCommandId,
          threadId: input.sourceThreadId,
          commandType: "agent.delegation.acknowledge",
          acceptedAt: at,
          events,
          effects: [],
        })
        .pipe(Effect.mapError(readError));
    }),
  );
  return { projectId: agent.projectId, threadId: targetThreadId } satisfies AgentDelegateResult;
});

const yieldCryptoDigest = Effect.fnUntraced(function* (encoded: string) {
  return yield* (yield* Crypto.Crypto)
    .digest("SHA-256", new TextEncoder().encode(encoded))
    .pipe(Effect.map(Encoding.encodeHex));
});

const getAgentDelegationImpl = Effect.fn("getAgentDelegation")(function* (
  input: AgentGetDelegationInput,
) {
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const threads = yield* ThreadManagement.ThreadManagementService;
  const projects = yield* ProjectStore.ProjectStoreV2;
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{
    payload_json: string;
  }>`SELECT payload_json FROM orchestration_v2_projection_turn_items
    WHERE thread_id = ${input.sourceThreadId} AND turn_item_id = ${input.activityId} AND type = 'system_notice' LIMIT 1`.pipe(
    Effect.mapError(readError),
  );
  const notice = rows[0]
    ? yield* decodeTurnItem(rows[0].payload_json).pipe(Effect.mapError(readError))
    : undefined;
  if (notice?.type !== "system_notice" || !notice.agentDelegation)
    return yield* fail("This agent task is unavailable.");
  const identity = notice.agentDelegation;
  const result: AgentGetDelegationResult = {
    ...identity,
    status: "unavailable",
    messages: [],
    truncated: false,
  };
  const agent = yield* projects.get(identity.agentProjectId).pipe(Effect.mapError(readError));
  if (
    Option.isNone(agent) ||
    agent.value.agentProfile?.conversationThreadId !== identity.agentThreadId
  )
    return result;
  yield* threads.ensureLegacyTranscript(identity.agentThreadId).pipe(Effect.mapError(readError));
  const target = yield* projections
    .getThreadRecords(identity.agentThreadId, ["messages", "runs"], {
      messageIds: [identity.targetMessageId],
      ...(identity.targetTurnId ? { runIds: [RunId.make(identity.targetTurnId)] } : {}),
    })
    .pipe(Effect.mapError(readError));
  if (target.thread.projectId !== identity.agentProjectId || target.thread.deletedAt !== null)
    return result;
  const request = target.messages[0];
  if (!request) return result;
  if (!request.runId) {
    const sql = yield* SqlClient.SqlClient;
    const turns = yield* sql<{ turn_id: string | null; state: string }>`
      SELECT turn_id, state FROM projection_turns WHERE thread_id = ${identity.agentThreadId}
        AND pending_message_id = ${identity.targetMessageId} LIMIT 1
    `.pipe(Effect.mapError(readError));
    const turn = turns[0];
    if (!turn?.turn_id) return result;
    const rows = yield* sql<{
      message_id: string;
      role: string;
      text: string;
      turn_id: string | null;
      attachments_json: string | null;
      context_json: string | null;
      is_streaming: number;
      created_at: string;
      updated_at: string;
    }>`
      SELECT message_id, role, text, turn_id, attachments_json, context_json, is_streaming, created_at, updated_at
      FROM projection_thread_messages WHERE thread_id = ${identity.agentThreadId} AND turn_id = ${turn.turn_id} AND role = 'assistant'
      ORDER BY created_at DESC, message_id DESC LIMIT 33
    `.pipe(Effect.mapError(readError));
    const messages = yield* Effect.forEach(rows.toReversed().slice(-32), (row) =>
      Effect.gen(function* () {
        const attachments = row.attachments_json
          ? yield* decodeLegacyAttachments(row.attachments_json)
          : undefined;
        const context = row.context_json ? yield* decodeLegacyContext(row.context_json) : undefined;
        return yield* decodeLegacyMessage({
          id: row.message_id,
          role: row.role,
          text: row.text,
          turnId: row.turn_id,
          streaming: false,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          ...(attachments ? { attachments } : {}),
          ...(context ? { context } : {}),
        });
      }),
    ).pipe(Effect.mapError(readError));
    return {
      ...result,
      targetTurnId: TurnId.make(turn.turn_id),
      messages,
      truncated: rows.length > 32,
      status:
        turn.state === "completed" || turn.state === "error" || turn.state === "interrupted"
          ? turn.state
          : "unavailable",
    } satisfies AgentGetDelegationResult;
  }
  const run = target.runs.find((item) => item.id === request.runId);
  if (!run) return result;
  const messages = yield* readMessages(identity.agentThreadId, request.runId).pipe(
    Effect.mapError(readError),
  );
  const replies = messages.filter((message) => message.role === "assistant");
  return {
    ...result,
    targetTurnId: TurnId.make(request.runId),
    status:
      run.status === "failed"
        ? "error"
        : run.status === "cancelled" || run.status === "rolled_back"
          ? "interrupted"
          : run.status === "preparing" || run.status === "starting" || run.status === "queued"
            ? "queued"
            : run.status === "running"
              ? "working"
              : run.status,
    messages: replies.slice(-32).map((message) => ({
      ...message,
      turnId: TurnId.make(request.runId!),
      createdAt: DateTime.formatIso(message.createdAt),
      updatedAt: DateTime.formatIso(message.updatedAt),
    })),
    truncated: messages.length > 32,
  } satisfies AgentGetDelegationResult;
});

// The source notice is the durable handoff record. Completion receipts retire each
// original run once, including obsolete requests, without taking ownership of the agent chat.
const reconcileImpl = Effect.fn("AgentDelegation.reconcile")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const projects = yield* ProjectStore.ProjectStoreV2;
  const threads = yield* ThreadManagement.ThreadManagementService;
  const commands = yield* ThreadCommandExecutor.ThreadCommandExecutor;
  const receipts = yield* CommandReceiptStore.CommandReceiptStoreV2;
  const candidates = yield* sql<{ thread_id: string; turn_item_id: string; payload_json: string }>`
    SELECT item.thread_id, item.turn_item_id, item.payload_json
    FROM orchestration_v2_projection_turn_items item
    JOIN orchestration_v2_projection_runs run
      ON run.run_id = json_extract(item.payload_json, '$.agentDelegation.targetTurnId')
      AND run.thread_id = json_extract(item.payload_json, '$.agentDelegation.agentThreadId')
    WHERE item.type = 'system_notice' AND run.status IN ('completed', 'failed', 'cancelled', 'interrupted', 'rolled_back')
      AND NOT EXISTS (SELECT 1 FROM orchestration_command_receipts receipt WHERE receipt.command_id = 'agent-delegate:result:' || item.turn_item_id)
    ORDER BY item.ordinal ASC, item.turn_item_id ASC LIMIT 100
  `.pipe(Effect.mapError(readError));
  for (const candidate of candidates) {
    const notice = yield* decodeTurnItem(candidate.payload_json).pipe(Effect.mapError(readError));
    if (notice.type !== "system_notice" || !notice.agentDelegation) continue;
    const identity = notice.agentDelegation;
    const commandId = CommandId.make(`agent-delegate:result:${notice.id}`);
    yield* Effect.gen(function* () {
      if (Option.isSome(yield* receipts.getByCommandId(commandId).pipe(Effect.mapError(readError))))
        return;
      const source = yield* threads
        .getThreadShell(notice.threadId)
        .pipe(Effect.mapError(readError));
      const newer = yield* sql<{
        found: number;
      }>`SELECT 1 AS found FROM orchestration_v2_projection_messages message
        LEFT JOIN orchestration_v2_projection_runs run ON run.run_id = message.run_id
        LEFT JOIN orchestration_v2_projection_turn_items item ON item.thread_id = message.thread_id AND item.type = 'user_message' AND json_extract(item.payload_json, '$.messageId') = message.message_id
        WHERE message.thread_id = ${notice.threadId} AND message.role = 'user' AND json_extract(message.payload_json, '$.createdBy') = 'user'
          AND message.message_id != ${identity.sourceMessageId}
          AND (run.ordinal > ${identity.sourceRunOrdinal ?? 0} OR item.ordinal > ${identity.sourceTurnItemOrdinal ?? notice.ordinal} OR message.created_at > ${identity.sourceRequestedAt ?? DateTime.formatIso(notice.startedAt ?? notice.updatedAt)}) LIMIT 1`.pipe(
        Effect.mapError(readError),
      );
      const project = source
        ? yield* projects.get(source.projectId).pipe(Effect.mapError(readError))
        : Option.none();
      if (
        !source ||
        source.archivedAt !== null ||
        source.deletedAt !== null ||
        Option.isNone(project) ||
        project.value.deletedAt !== null ||
        project.value.agentProfile?.archived ||
        newer.length > 0
      ) {
        const now = yield* DateTime.now;
        yield* commands.withLock(
          notice.threadId,
          receipts
            .insertIfAbsent({
              commandId,
              commandType: "agent-delegation.result-disposed",
              threadId: notice.threadId,
              acceptedAt: now,
              resultSequence: 0,
              status: "accepted",
              error: null,
            })
            .pipe(Effect.mapError(readError)),
        );
        return;
      }
      const result = yield* getAgentDelegationImpl({
        sourceThreadId: notice.threadId,
        activityId: EventId.make(notice.id),
      });
      const reply = result.messages
        .map((message) => message.text)
        .join("\n\n")
        .slice(-24_000);
      yield* threads
        .dispatch({
          type: "message.dispatch",
          commandId,
          threadId: notice.threadId,
          messageId: MessageId.make(`agent-delegate:result:${notice.id}`),
          text: `Agent ${identity.agentName} finished the delegated request (${result.status}).\n\n${reply || "The original run ended without an assistant result."}`,
          attachments: [],
          senderThreadId: identity.agentThreadId,
          createdBy: "agent",
          creationSource: "server",
          dispatchMode: { type: "queue_after_active" },
          context: {
            version: 1,
            records: [
              {
                version: 1,
                contextId: ComposerContextId.make(
                  `agent_result_${yield* yieldCryptoDigest(notice.id).pipe(Effect.mapError(readError))}`,
                ),
                kind: "elysia-agent-result",
                label: `${identity.agentName} result`,
                payload: {
                  agentDelegation: identity,
                  sourceNoticeOrdinal: identity.sourceTurnItemOrdinal ?? notice.ordinal,
                  status: result.status,
                  truncated: result.truncated,
                },
              },
            ],
          },
        })
        .pipe(Effect.mapError(readError));
    }).pipe(
      Effect.catch((error) =>
        Effect.logWarning("Could not return a persistent agent result", {
          activityId: notice.id,
          error,
        }),
      ),
    );
  }
});

export class AgentDelegation extends Context.Service<
  AgentDelegation,
  {
    readonly delegate: (
      input: AgentDelegateInput,
    ) => Effect.Effect<AgentDelegateResult, OrchestrationDispatchCommandError>;
    readonly reconcile: () => Effect.Effect<void, OrchestrationDispatchCommandError>;
    readonly get: (
      input: AgentGetDelegationInput,
    ) => Effect.Effect<AgentGetDelegationResult, OrchestrationDispatchCommandError>;
  }
>()("t3/orchestration-v2/AgentDelegation") {}
const make = Effect.gen(function* () {
  const context = yield* Effect.context<
    | Effect.Services<ReturnType<typeof delegateToPersistentAgentImpl>>
    | Effect.Services<ReturnType<typeof getAgentDelegationImpl>>
    | Effect.Services<ReturnType<typeof reconcileImpl>>
  >();
  return AgentDelegation.of({
    delegate: (input) => delegateToPersistentAgentImpl(input).pipe(Effect.provide(context)),
    reconcile: () => reconcileImpl().pipe(Effect.provide(context)),
    get: (input) => getAgentDelegationImpl(input).pipe(Effect.provide(context)),
  });
});
export const layer = Layer.effect(AgentDelegation, make);
export const delegateToPersistentAgent = Effect.fn("AgentDelegation.delegate")(function* (
  input: AgentDelegateInput,
) {
  return yield* (yield* AgentDelegation).delegate(input);
});
export const getAgentDelegation = Effect.fn("AgentDelegation.get")(function* (
  input: AgentGetDelegationInput,
) {
  return yield* (yield* AgentDelegation).get(input);
});

export const workerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const service = yield* AgentDelegation;
    const scheduler = yield* Scheduler.Scheduler;
    yield* scheduler.register(
      "persistent-agent-results",
      service
        .reconcile()
        .pipe(
          Effect.catch((error) =>
            Effect.logWarning("Could not reconcile persistent agent results", { error }),
          ),
        ),
    );
  }),
);

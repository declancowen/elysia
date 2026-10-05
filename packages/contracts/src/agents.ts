import * as Schema from "effect/Schema";
import {
  CommandId,
  EventId,
  IsoDateTime,
  MessageId,
  ProjectId,
  ThreadId,
  TurnId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import {
  ChatAttachment,
  UploadChatAttachment,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
} from "./chatAttachment.ts";
import { OrchestrationMessageContext } from "./composerContext.ts";
import { ModelSelection } from "./modelSelection.ts";

export const AgentProfile = Schema.Struct({
  instructions: Schema.String.check(Schema.isMaxLength(32_000)),
  title: Schema.optional(TrimmedNonEmptyString),
  avatar: Schema.Struct({
    preset: Schema.Literals([
      "square",
      "triangle",
      "squircle",
      "circle",
      "hex",
      "cloud",
      "pill",
      "drop",
      "square-round-eyes",
      "triangle-round-eyes",
      "pill-round-eyes",
      "squircle-wide-eyes",
      "robot",
      "sparkles",
      "brain",
      "briefcase",
      "code",
      "planet",
    ]),
    color: Schema.Literals([
      "#003CB2",
      "#28B4FF",
      "#AAE6FF",
      "#C9FCED",
      "#33D7C8",
      "#00786E",
      "#D8AFFF",
      "#9423FC",
      "#551491",
      "#FFB2C1",
      "#FF547C",
      "#BF1B4F",
      "#F5E669",
      "#EEAF00",
      "#B05223",
      "blue",
      "violet",
      "green",
      "orange",
      "rose",
      "cyan",
    ]),
  }),
  notificationsEnabled: Schema.Boolean,
  archived: Schema.Boolean,
  conversationThreadId: Schema.optional(ThreadId),
  group: Schema.optional(
    Schema.Struct({
      memberProjectIds: Schema.Array(ProjectId).check(
        Schema.isMinLength(2),
        Schema.isMaxLength(32),
      ),
      leadProjectId: ProjectId,
      workspaceRoot: Schema.optional(TrimmedNonEmptyString),
      linkedProjectId: Schema.optional(ProjectId),
    }).check(
      Schema.makeFilter(
        (group) =>
          new Set(group.memberProjectIds).size === group.memberProjectIds.length &&
          group.memberProjectIds.includes(group.leadProjectId),
      ),
    ),
  ),
});
export type AgentProfile = typeof AgentProfile.Type;

export const AgentCreateInput = Schema.Struct({
  name: TrimmedNonEmptyString,
  agentProfile: AgentProfile,
  defaultModelSelection: ModelSelection,
  enableAgentBrowserAccess: Schema.optional(Schema.Boolean),
});
export type AgentCreateInput = typeof AgentCreateInput.Type;

export const AgentCreateResult = Schema.Struct({ projectId: ProjectId, threadId: ThreadId });
export type AgentCreateResult = typeof AgentCreateResult.Type;

export const AgentResetInput = Schema.Struct({
  commandId: CommandId,
  projectId: ProjectId,
  previousThreadId: ThreadId,
  threadId: ThreadId,
});
export type AgentResetInput = typeof AgentResetInput.Type;

export const AgentDelegateInput = Schema.Struct({
  commandId: CommandId,
  sourceThreadId: ThreadId,
  agentProjectId: ProjectId,
  messageId: MessageId,
  text: Schema.String.check(Schema.isMaxLength(64_000)),
  attachments: Schema.optional(
    Schema.Array(Schema.Union([UploadChatAttachment, ChatAttachment])).check(
      Schema.isMaxLength(PROVIDER_SEND_TURN_MAX_ATTACHMENTS),
    ),
  ),
  context: Schema.optional(OrchestrationMessageContext),
});
export type AgentDelegateInput = typeof AgentDelegateInput.Type;

export const AgentDelegateResult = Schema.Struct({ projectId: ProjectId, threadId: ThreadId });
export type AgentDelegateResult = typeof AgentDelegateResult.Type;

export const OrchestrationMessage = Schema.Struct({
  id: MessageId,
  role: Schema.Literals(["user", "assistant", "system", "reasoning"]),
  text: Schema.String,
  attachments: Schema.optional(Schema.Array(ChatAttachment)),
  context: Schema.optional(OrchestrationMessageContext),
  turnId: Schema.NullOr(TurnId),
  streaming: Schema.Boolean,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type OrchestrationMessage = typeof OrchestrationMessage.Type;

export const AgentDelegationActivityPayload = Schema.Struct({
  agentProjectId: ProjectId,
  agentThreadId: ThreadId,
  agentName: Schema.String,
  sourceMessageId: MessageId,
  sourceRunOrdinal: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  sourceTurnItemOrdinal: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  sourceRequestedAt: Schema.optional(IsoDateTime),
  targetMessageId: MessageId,
  targetTurnId: Schema.NullOr(TurnId),
});
export type AgentDelegationActivityPayload = typeof AgentDelegationActivityPayload.Type;

export const AgentGetDelegationInput = Schema.Struct({
  sourceThreadId: ThreadId,
  activityId: EventId,
});
export type AgentGetDelegationInput = typeof AgentGetDelegationInput.Type;

export const AgentGetDelegationResult = Schema.Struct({
  respondingAgentProjectId: Schema.optional(ProjectId),
  agentProjectId: ProjectId,
  agentThreadId: ThreadId,
  agentName: Schema.String,
  targetMessageId: MessageId,
  targetTurnId: Schema.NullOr(TurnId),
  status: Schema.Literals([
    "queued",
    "working",
    "waiting",
    "completed",
    "interrupted",
    "error",
    "unavailable",
  ]),
  messages: Schema.Array(OrchestrationMessage).check(Schema.isMaxLength(32)),
  truncated: Schema.Boolean,
});
export type AgentGetDelegationResult = typeof AgentGetDelegationResult.Type;

export const AgentConversationPreviewsInput = Schema.Struct({
  projectIds: Schema.Array(ProjectId).check(Schema.isMaxLength(100)),
});
export type AgentConversationPreviewsInput = typeof AgentConversationPreviewsInput.Type;
export const AgentConversationPreviewsResult = Schema.Array(
  Schema.Struct({
    projectId: ProjectId,
    threadId: ThreadId,
    text: Schema.String.check(Schema.isMaxLength(240)),
    updatedAt: IsoDateTime,
  }),
);
export type AgentConversationPreviewsResult = typeof AgentConversationPreviewsResult.Type;

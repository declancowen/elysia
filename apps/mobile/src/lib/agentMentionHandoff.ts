import type { CommandId, MessageId, OrchestrationMessageContext } from "@elysiatools/contracts";
import type { DraftComposerAttachment } from "./composerImages";

export interface AgentMentionDraft {
  readonly text: string;
  readonly context?: OrchestrationMessageContext | undefined;
  readonly attachments: ReadonlyArray<DraftComposerAttachment>;
}

export function agentMentionInputError(text: string): string | null {
  return text.length > 64_000 ? "Keep the message at or below 64000 characters." : null;
}

/** Upload bookkeeping and composer settings do not change the message being delegated. */
export function agentMentionDraftKey(draft: AgentMentionDraft): string {
  return JSON.stringify({
    text: draft.text,
    context: draft.context,
    attachments: draft.attachments.map(
      ({ uploadedAttachmentId: _id, uploadEnvironmentId: _environment, ...attachment }) =>
        attachment,
    ),
  });
}

/** Retrying an unknown acceptance must reuse its IDs; a later draft gets its own IDs. */
export function createAgentMentionHandoff(
  makeIds: () => { commandId: CommandId; messageId: MessageId },
) {
  const attempts = new Map<
    string,
    { key: string; ids: ReturnType<typeof makeIds>; inFlight: boolean }
  >();
  return {
    async send(input: {
      readonly scopeKey: string;
      readonly draft: AgentMentionDraft;
      readonly readDraft: () => AgentMentionDraft;
      readonly deliver: (ids: ReturnType<typeof makeIds>) => Promise<void>;
      readonly clearAcceptedDraft: () => void;
    }): Promise<MessageId | null> {
      const previous = attempts.get(input.scopeKey);
      if (previous?.inFlight) return null;
      const key = agentMentionDraftKey(input.draft);
      const attempt = previous?.key === key ? previous : { key, ids: makeIds(), inFlight: false };
      attempts.set(input.scopeKey, attempt);
      attempt.inFlight = true;
      try {
        await input.deliver(attempt.ids);
        if (agentMentionDraftKey(input.readDraft()) === key) input.clearAcceptedDraft();
        attempts.delete(input.scopeKey);
        return attempt.ids.messageId;
      } finally {
        attempt.inFlight = false;
      }
    },
  };
}

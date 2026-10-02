import * as Schema from "effect/Schema";
import {
  AgentDelegateInput,
  CommandId,
  EnvironmentId,
  MessageId,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  agentMentionDraftKey,
  agentMentionInputError,
  createAgentMentionHandoff,
  type AgentMentionDraft,
} from "./agentMentionHandoff";

function harness() {
  let sequence = 0;
  const makeIds = vi.fn(() => ({
    commandId: CommandId.make(`command-${++sequence}`),
    messageId: MessageId.make(`message-${sequence}`),
  }));
  return { makeIds, handoff: createAgentMentionHandoff(makeIds) };
}

describe("mobile agent handoff", () => {
  it("matches the server handoff length boundary", () => {
    const accepts = Schema.is(AgentDelegateInput);
    for (const length of [63_999, 64_000, 64_001, 120_000]) {
      const text = "x".repeat(length);
      const serverInput = {
        commandId: CommandId.make("send"),
        sourceThreadId: ThreadId.make("source"),
        agentProjectId: ProjectId.make("target"),
        messageId: MessageId.make("message"),
        text,
      };
      expect(agentMentionInputError(text) === null).toBe(accepts(serverInput));
    }
    expect(agentMentionInputError("x".repeat(64_001))).toContain("64000");
  });

  it("retains the failed draft and retries unknown acceptance with the same request/message identity", async () => {
    const { handoff, makeIds } = harness();
    let draft: AgentMentionDraft = { text: "@agent help me", attachments: [] };
    const deliver = vi
      .fn()
      .mockRejectedValueOnce(new Error("Response lost"))
      .mockResolvedValueOnce(undefined);
    const clearAcceptedDraft = vi.fn(() => {
      draft = { text: "", attachments: [] };
    });
    const input = {
      scopeKey: "local:source",
      draft,
      readDraft: () => draft,
      deliver,
      clearAcceptedDraft,
    };
    await expect(handoff.send(input)).rejects.toThrow("Response lost");
    expect(draft.text).toBe("@agent help me");
    expect(clearAcceptedDraft).not.toHaveBeenCalled();
    await expect(handoff.send(input)).resolves.toBe("message-1");
    expect(deliver.mock.calls[1]?.[0]).toEqual(deliver.mock.calls[0]?.[0]);
    expect(makeIds).toHaveBeenCalledOnce();
    expect(draft.text).toBe("");
  });

  it("does not erase a new draft typed while handoff is pending or dispatch a second concurrent request", async () => {
    const { handoff } = harness();
    let draft: AgentMentionDraft = { text: "First request", attachments: [] };
    const response = Promise.withResolvers<void>();
    const deliver = vi.fn(() => response.promise);
    const clearAcceptedDraft = vi.fn();
    const input = {
      scopeKey: "local:source",
      draft,
      readDraft: () => draft,
      deliver,
      clearAcceptedDraft,
    };
    const pending = handoff.send(input);
    draft = { text: "New request", attachments: [] };
    await expect(handoff.send({ ...input, draft })).resolves.toBeNull();
    response.resolve();
    await expect(pending).resolves.toBe("message-1");
    expect(clearAcceptedDraft).not.toHaveBeenCalled();
    expect(draft.text).toBe("New request");
    expect(deliver).toHaveBeenCalledOnce();
  });

  it("scopes retry identities by source chat and issues fresh IDs for edited content", async () => {
    const { handoff, makeIds } = harness();
    const draft: AgentMentionDraft = { text: "First request", attachments: [] };
    const deliver = vi.fn().mockRejectedValue(new Error("Offline"));
    const input = {
      scopeKey: "local:first",
      draft,
      readDraft: () => draft,
      deliver,
      clearAcceptedDraft: vi.fn(),
    };
    await expect(handoff.send(input)).rejects.toThrow();
    await expect(handoff.send({ ...input, scopeKey: "local:second" })).rejects.toThrow();
    await expect(
      handoff.send({ ...input, draft: { ...draft, text: "Edited request" } }),
    ).rejects.toThrow();
    expect(makeIds).toHaveBeenCalledTimes(3);
    expect(deliver.mock.calls.map(([ids]) => ids.messageId)).toEqual([
      "message-1",
      "message-2",
      "message-3",
    ]);
  });

  it("keeps retry identity through upload bookkeeping while file edits change it", () => {
    const file = {
      id: "file",
      type: "file" as const,
      name: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: 30,
      fileUri: "file:///notes.txt",
    };
    const draft = { text: "Read notes", attachments: [file] };
    expect(
      agentMentionDraftKey({
        ...draft,
        attachments: [
          {
            ...file,
            uploadEnvironmentId: EnvironmentId.make("local"),
            uploadedAttachmentId: "pending-file",
          },
        ],
      }),
    ).toBe(agentMentionDraftKey(draft));
    expect(
      agentMentionDraftKey({ ...draft, attachments: [{ ...file, id: "replacement" }] }),
    ).not.toBe(agentMentionDraftKey(draft));
  });

  it("clears unchanged content after uploaded references arrive and gives a later repeated message a new identity", async () => {
    const { handoff, makeIds } = harness();
    const file = {
      id: "file",
      type: "file" as const,
      name: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: 30,
      fileUri: "file:///notes.txt",
    };
    const original = { text: "Read notes", attachments: [file] };
    let draft: AgentMentionDraft = original;
    const deliver = vi.fn(async () => {
      draft = {
        ...draft,
        attachments: [
          {
            ...file,
            uploadEnvironmentId: EnvironmentId.make("local"),
            uploadedAttachmentId: "pending-file",
          },
        ],
      };
    });
    const clearAcceptedDraft = vi.fn(() => {
      draft = { text: "", attachments: [] };
    });
    const input = {
      scopeKey: "local:source",
      draft,
      readDraft: () => draft,
      deliver,
      clearAcceptedDraft,
    };
    await expect(handoff.send(input)).resolves.toBe("message-1");
    expect(draft.text).toBe("");
    draft = original;
    await expect(handoff.send({ ...input, draft })).resolves.toBe("message-2");
    expect(makeIds).toHaveBeenCalledTimes(2);
  });
});

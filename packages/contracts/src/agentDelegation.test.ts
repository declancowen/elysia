import { assert, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { AgentDelegateInput } from "./agents.ts";

const decode = Schema.decodeUnknownSync(AgentDelegateInput);
const input = {
  commandId: "handoff-1",
  sourceThreadId: "source",
  agentProjectId: "friday",
  messageId: "message-1",
  text: "Please investigate.",
};

it("keeps delegation routing explicit and accepts normal upload and chip wire data", () => {
  const attachment = {
    type: "image",
    id: "pending-upload",
    name: "screen.png",
    mimeType: "image/png",
    sizeBytes: 3,
    dataUrl: "data:image/png;base64,AQID",
  };
  const result = decode({
    ...input,
    attachments: [attachment],
    context: {
      version: 1,
      records: [
        {
          version: 1,
          kind: "image",
          contextId: "screen",
          label: "screen.png",
          attachmentId: "pending-upload",
          name: "screen.png",
          mimeType: "image/png",
          sizeBytes: 3,
        },
      ],
    },
  });
  assert.equal(result.agentProjectId, "friday");
  assert.equal(result.context?.records[0]?.kind, "image");
  assert.equal(result.attachments?.[0]?.name, "screen.png");
  assert.isUndefined(decode(input).attachments);
});

it("rejects missing routing identities and an unbounded task", () => {
  for (const key of ["commandId", "sourceThreadId", "agentProjectId", "messageId"]) {
    assert.throws(() => decode({ ...input, [key]: "" }));
  }
  assert.throws(() => decode({ ...input, text: "x".repeat(64_001) }));
});

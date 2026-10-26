import { assert, it } from "@effect/vitest";
import { Tool } from "effect/ai";
import { OrchestratorToolkit } from "./tools.ts";

it("publishes member collaboration on the send tool with a bounded automatic budget", () => {
  const send = OrchestratorToolkit.tools.elysia_thread_send;
  const schema = Tool.getJsonSchema(send) as {
    readonly properties?: Readonly<Record<string, unknown>>;
  };
  assert.property(schema.properties ?? {}, "channelAgentProjectId");
  assert.include(send.description ?? "", "channelAgentProjectId");
  assert.include(send.description ?? "", "eight automatic messages");
  assert.notInclude(
    OrchestratorToolkit.tools.elysia_thread_update.description ?? "",
    "channelAgentProjectId",
  );
});

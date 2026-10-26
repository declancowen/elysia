import { assert, it } from "@effect/vitest";
import { ELYSIA_ORCHESTRATION_INSTRUCTIONS } from "./orchestrationInstructions.ts";

it("uses the exact environment keys supplied to the ACP bridge", () => {
  assert.include(ELYSIA_ORCHESTRATION_INSTRUCTIONS, "$ELYSIA_ACP_MCP_NODE");
  assert.include(ELYSIA_ORCHESTRATION_INSTRUCTIONS, "$ELYSIA_ACP_MCP_ENTRYPOINT");
  assert.notInclude(ELYSIA_ORCHESTRATION_INSTRUCTIONS, "Elysia_ACP_MCP_");
});

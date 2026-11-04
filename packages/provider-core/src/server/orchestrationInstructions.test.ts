import { assert, describe, it } from "@effect/vitest";

import {
  ELYSIA_DEVICE_TOOL_INSTRUCTIONS,
  ELYSIA_DEVICE_TOOL_INSTRUCTIONS_WITH_TOOL_SEARCH,
  ELYSIA_ORCHESTRATION_INSTRUCTIONS,
  elysiaAcpPromptWithInstructions,
  elysiaOrchestrationPrompt,
  elysiaOrchestrationSystemPrompt,
} from "./orchestrationInstructions.ts";

describe("Elysia device instructions", () => {
  it("route device work through device_open and give Claude the line that loads the tools", () => {
    for (const intent of ["`device_list`", "`device_open`", "`agent-device`", "ssh", "`hostId`"]) {
      assert.include(ELYSIA_DEVICE_TOOL_INSTRUCTIONS, intent);
    }
    assert.notInclude(ELYSIA_DEVICE_TOOL_INSTRUCTIONS, "ToolSearch");
    const loadLine =
      " Load them with ToolSearch `select:mcp__elysia__device_list,mcp__elysia__device_open,mcp__elysia__device_screenshot,mcp__elysia__device_close`.";
    assert.include(ELYSIA_DEVICE_TOOL_INSTRUCTIONS_WITH_TOOL_SEARCH, loadLine);
    assert.equal(
      ELYSIA_DEVICE_TOOL_INSTRUCTIONS_WITH_TOOL_SEARCH.replace(loadLine, ""),
      ELYSIA_DEVICE_TOOL_INSTRUCTIONS,
    );
  });

  it("open the app before the returned command's snapshots, screenshots and input", () => {
    assert.include(
      ELYSIA_DEVICE_TOOL_INSTRUCTIONS,
      "its snapshots, screenshots and input need `open <app>` first,",
    );
  });

  it("keep the failure rule from taking over or closing a session another thread holds", () => {
    // agent-device's DEVICE_IN_USE advice is to rerun with the owner's --session or close it first.
    assert.include(
      ELYSIA_DEVICE_TOOL_INSTRUCTIONS,
      "follow its advice once, but never reuse or close another session; if it still fails,",
    );
  });

  it("reach OpenCode and Cursor only when the session holds device access", () => {
    assert.include(elysiaOrchestrationSystemPrompt(true, true), ELYSIA_DEVICE_TOOL_INSTRUCTIONS);
    assert.notInclude(elysiaOrchestrationSystemPrompt(true, false), "## Elysia devices");
    assert.isUndefined(elysiaOrchestrationSystemPrompt(false, true));

    const firstRun = (hasDeviceTools: boolean) =>
      elysiaOrchestrationPrompt({
        prompt: "Check the login screen.",
        hasElysiaMcp: true,
        hasDeviceTools,
        orchestrationDelivered: false,
        deviceInstructionsDelivered: false,
      });
    assert.include(firstRun(true), ELYSIA_DEVICE_TOOL_INSTRUCTIONS);
    assert.notInclude(firstRun(false), "## Elysia devices");

    const laterRun = (deviceInstructionsDelivered: boolean) =>
      elysiaOrchestrationPrompt({
        prompt: "Check the login screen.",
        hasElysiaMcp: true,
        hasDeviceTools: true,
        orchestrationDelivered: true,
        deviceInstructionsDelivered,
      });
    assert.include(laterRun(false), ELYSIA_DEVICE_TOOL_INSTRUCTIONS);
    assert.notInclude(laterRun(false), ELYSIA_ORCHESTRATION_INSTRUCTIONS.trim());
    assert.equal(laterRun(true), "Check the login screen.");
  });

  it("reach ACP agents again when device access changes mid-thread", () => {
    const state = {
      interactionMode: "default",
      hasElysiaMcp: true,
      hasDeviceTools: false,
    } as const;
    const withDevices = elysiaAcpPromptWithInstructions({
      prompt: "Check the login screen.",
      state: { ...state, hasDeviceTools: true },
      previousState: state,
    });
    assert.include(withDevices, ELYSIA_DEVICE_TOOL_INSTRUCTIONS);
    assert.equal(
      elysiaAcpPromptWithInstructions({ prompt: "Again.", state, previousState: state }),
      "Again.",
    );
    assert.notInclude(
      elysiaAcpPromptWithInstructions({ prompt: "Hi.", state }),
      "## Elysia devices",
    );
  });
});

it("uses the exact environment keys supplied to the ACP bridge", () => {
  const prompt = elysiaAcpPromptWithInstructions({
    prompt: "Work",
    state: { interactionMode: "default", hasElysiaMcp: true, hasDeviceTools: false },
  });
  assert.include(prompt, "$ELYSIA_ACP_MCP_NODE");
  assert.include(prompt, "$ELYSIA_ACP_MCP_ENTRYPOINT");
  assert.notInclude(prompt, "Elysia_ACP_MCP_");
});

import { assert, describe, it } from "@effect/vitest";

import {
  ELYSIA_ORCHESTRATION_INSTRUCTIONS,
  elysiaAcpPromptWithInstructions,
  elysiaOrchestrationPromptForFirstRun,
  elysiaOrchestrationSystemPrompt,
} from "./ElysiaOrchestrationInstructions.ts";

describe("Elysia orchestration provider instructions", () => {
  it("distinguishes delegated subagents from ordinary top-level threads", () => {
    assert.include(ELYSIA_ORCHESTRATION_INSTRUCTIONS, "Use `delegate_task`");
    assert.include(ELYSIA_ORCHESTRATION_INSTRUCTIONS, "ordinary top-level Elysia conversations");
    assert.include(ELYSIA_ORCHESTRATION_INSTRUCTIONS, "Never use them merely");
    assert.include(ELYSIA_ORCHESTRATION_INSTRUCTIONS, "cross-provider");
    assert.include(ELYSIA_ORCHESTRATION_INSTRUCTIONS, "call `delegate_task` again");
    assert.include(
      ELYSIA_ORCHESTRATION_INSTRUCTIONS,
      "Do not use `elysia_thread_send` on `childThreadId`",
    );
  });

  it("documents structured schedules instead of JSON strings", () => {
    assert.include(ELYSIA_ORCHESTRATION_INSTRUCTIONS, "structured object, never as JSON text");
    assert.include(ELYSIA_ORCHESTRATION_INSTRUCTIONS, '"everyMs":3600000');
    assert.include(ELYSIA_ORCHESTRATION_INSTRUCTIONS, "bindToCurrentThread=false");
  });

  it("uses the exact environment keys supplied to the ACP bridge", () => {
    assert.include(ELYSIA_ORCHESTRATION_INSTRUCTIONS, "$ELYSIA_ACP_MCP_NODE");
    assert.include(ELYSIA_ORCHESTRATION_INSTRUCTIONS, "$ELYSIA_ACP_MCP_ENTRYPOINT");
    assert.notInclude(ELYSIA_ORCHESTRATION_INSTRUCTIONS, "Elysia_ACP_MCP_");
  });

  it("injects prompt fallback only for an MCP-enabled first run", () => {
    const prompt = "Inspect the repository.";
    const injected = elysiaOrchestrationPromptForFirstRun({
      prompt,
      runOrdinal: 1,
      hasElysiaMcp: true,
    });

    assert.include(injected, "<elysia_orchestration_instructions>");
    assert.include(injected, `<user_request>\n${prompt}\n</user_request>`);
    assert.equal(
      elysiaOrchestrationPromptForFirstRun({ prompt, runOrdinal: 2, hasElysiaMcp: true }),
      prompt,
    );
    assert.equal(
      elysiaOrchestrationPromptForFirstRun({ prompt, runOrdinal: 1, hasElysiaMcp: false }),
      prompt,
    );
  });

  it("only exposes the system prompt when the Elysia MCP server is attached", () => {
    assert.equal(elysiaOrchestrationSystemPrompt(false), undefined);
    assert.equal(elysiaOrchestrationSystemPrompt(true), ELYSIA_ORCHESTRATION_INSTRUCTIONS);
  });

  it("gives ACP sessions provider-neutral mode, browser, and orchestration guidance", () => {
    const injected = elysiaAcpPromptWithInstructions({
      prompt: "Inspect the repository.",
      state: { interactionMode: "default", hasElysiaMcp: true },
    });

    assert.include(injected, "Elysia interaction mode: Default");
    assert.include(injected, "Elysia collaborative browser");
    assert.include(injected, "Elysia orchestration");
    assert.include(injected, "<user_request>\nInspect the repository.\n</user_request>");
  });

  it("reinjects ACP guidance only when mode or tool availability changes", () => {
    const prompt = "Continue.";
    const defaultState = { interactionMode: "default", hasElysiaMcp: true } as const;

    assert.equal(
      elysiaAcpPromptWithInstructions({ prompt, state: defaultState, previousState: defaultState }),
      prompt,
    );
    assert.include(
      elysiaAcpPromptWithInstructions({
        prompt,
        state: { ...defaultState, interactionMode: "plan" },
        previousState: defaultState,
      }),
      "Elysia interaction mode: Plan",
    );
    const withoutMcp = elysiaAcpPromptWithInstructions({
      prompt,
      state: { interactionMode: "default", hasElysiaMcp: false },
    });
    assert.include(withoutMcp, "Elysia interaction mode: Default");
    assert.notInclude(withoutMcp, "Elysia collaborative browser");
    assert.notInclude(withoutMcp, "Elysia orchestration");
  });
});

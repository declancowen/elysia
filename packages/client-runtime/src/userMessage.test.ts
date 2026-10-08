import { ScheduledTaskId } from "@elysiatools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveUserMessageIntentMarker, resolveUserMessagePresentation } from "./userMessage.ts";

describe("resolveUserMessagePresentation", () => {
  const legacyText = "[Triggered by schedule task: Daily audit]\n\nCheck for crashes.\n";

  it("removes attribution from legacy scheduled prompts", () => {
    expect(
      resolveUserMessagePresentation({ role: "user", createdBy: "agent", text: legacyText }),
    ).toEqual({ text: "Check for crashes.\n", isAutomation: true, scheduledTaskId: undefined });
  });

  it("uses task metadata without changing the prompt", () => {
    expect(
      resolveUserMessagePresentation({
        role: "user",
        createdBy: "agent",
        scheduledTaskId: ScheduledTaskId.make("task-1"),
        text: legacyText,
      }),
    ).toEqual({ text: legacyText, isAutomation: true, scheduledTaskId: "task-1" });
  });

  it("preserves user-written and assistant-quoted schedule headers", () => {
    for (const message of [
      { role: "user", createdBy: "user" as const },
      { role: "user" },
      { role: "assistant", createdBy: "agent" as const },
    ]) {
      expect(resolveUserMessagePresentation({ ...message, text: legacyText })).toEqual({
        text: legacyText,
        isAutomation: false,
        scheduledTaskId: undefined,
      });
    }
  });

  it("leaves other agent prompts and embedded headers intact", () => {
    for (const text of [
      "Review this area",
      `Quoted prompt:\n${legacyText}`,
      "[Triggered by schedule task: Daily audit]",
    ]) {
      expect(resolveUserMessagePresentation({ role: "user", createdBy: "agent", text })).toEqual({
        text,
        isAutomation: false,
        scheduledTaskId: undefined,
      });
    }
  });

  it("recovers the triggering automation from older scheduler message ids", () => {
    for (const trigger of ["scheduled", "manual"]) {
      expect(
        resolveUserMessagePresentation({
          id: `scheduled-task-message:task:daily-audit:1788661140000:${trigger}`,
          role: "user",
          createdBy: "user",
          text: legacyText,
        }),
      ).toEqual({
        text: "Check for crashes.\n",
        isAutomation: true,
        scheduledTaskId: "task:daily-audit",
      });
    }
  });
});

describe("user message queue presentation", () => {
  it("removes the pending queue marker as the same queued request is sent and answered", () => {
    // V2 retains queued_turn on the delivered user item, including completed history.
    const intent = "queued_turn";
    expect(resolveUserMessageIntentMarker(intent, "queued")).toBe("queued_turn");
    expect(resolveUserMessageIntentMarker(intent, "starting")).toBeNull();
    expect(resolveUserMessageIntentMarker(intent, "running")).toBeNull();
    expect(resolveUserMessageIntentMarker(intent, "waiting")).toBeNull();
    expect(resolveUserMessageIntentMarker(intent, "completed")).toBeNull();
  });

  it("does not call cancelled, failed or unloaded historical requests queued", () => {
    expect(resolveUserMessageIntentMarker("queued_turn", "cancelled")).toBeNull();
    expect(resolveUserMessageIntentMarker("queued_turn", "failed")).toBeNull();
    expect(resolveUserMessageIntentMarker("queued_turn", "interrupted")).toBeNull();
    expect(resolveUserMessageIntentMarker("queued_turn", "rolled_back")).toBeNull();
    expect(resolveUserMessageIntentMarker("queued_turn", undefined)).toBeNull();
  });

  it("keeps steering provenance distinct from pending queue state", () => {
    expect(resolveUserMessageIntentMarker("promoted_queued_to_steer", "running")).toBe(
      "promoted_queued_to_steer",
    );
    expect(resolveUserMessageIntentMarker("promoted_queued_to_steer", "completed")).toBe(
      "promoted_queued_to_steer",
    );
    expect(resolveUserMessageIntentMarker("steer", "completed")).toBe("steer");
    expect(resolveUserMessageIntentMarker("turn_start", "queued")).toBeNull();
    expect(resolveUserMessageIntentMarker(undefined, "queued")).toBeNull();
  });
});

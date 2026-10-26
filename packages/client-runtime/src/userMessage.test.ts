import { describe, expect, it } from "vite-plus/test";

import { GuestMessageId } from "@elysiatools/contracts";

import { resolveUserMessageIntentMarker, resolveUserMessagePresentation } from "./userMessage.ts";

describe("resolveUserMessagePresentation", () => {
  const legacyText = "[Triggered by schedule task: Daily audit]\n\nCheck for crashes.\n";

  it("preserves user-written and assistant-quoted schedule headers", () => {
    for (const message of [
      { role: "user", createdBy: "user" as const },
      { role: "user" },
      { role: "assistant", createdBy: "agent" as const },
    ]) {
      expect(resolveUserMessagePresentation({ ...message, text: legacyText })).toEqual({
        text: legacyText,
        attribution: null,
        scheduledTaskId: undefined,
      });
    }
  });

  it("shows a guest's own words and name, not the attributed text the agent reads", () => {
    expect(
      resolveUserMessagePresentation({
        role: "user",
        createdBy: "user",
        text: "Message from guest Sam, sent by the owner:\n\nWhy?",
        context: {
          guest: {
            guestMessageId: GuestMessageId.make("guest-message:one"),
            name: "Sam",
            text: "Why?",
          },
        },
      }),
    ).toEqual({ text: "Why?", attribution: "guest", scheduledTaskId: undefined, guestName: "Sam" });
  });

  it("attributes older server-sent restart continuations to Elysia, not another agent", () => {
    const text = "Note: the Elysia server restarted.";
    expect(
      resolveUserMessagePresentation({
        role: "user",
        createdBy: "agent",
        creationSource: "server",
        text,
      }),
    ).toMatchObject({ attribution: "elysia" });
    for (const creationSource of ["mcp", "provider"] as const) {
      expect(
        resolveUserMessagePresentation({ role: "user", createdBy: "agent", creationSource, text }),
      ).toMatchObject({ attribution: "agent" });
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
        attribution: "automation",
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

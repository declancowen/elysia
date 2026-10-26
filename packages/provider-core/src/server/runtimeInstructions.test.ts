import { assert, describe, expect, it } from "@effect/vitest";
import {
  buildPersistentAgentInstructions,
  buildRuntimeInstructions,
} from "./runtimeInstructions.ts";

describe("buildRuntimeInstructions", () => {
  it("links PRs the agent creates, takes over, or pushes to, and no others", () => {
    const instructions = buildRuntimeInstructions({ harness: "Codex" });
    assert.include(instructions, "you are running in Elysia");

    assert.include(instructions, "Link each PR you create, take over, or push to");
    assert.include(instructions, "one link_pull_request per PR");
    assert.include(instructions, "Skip PRs you only read or review");
    assert.include(instructions, "If linking fails, say so.");
    assert.notInclude(instructions, "git log -1");
    assert.notInclude(instructions, "work on");
    // Listing linked PRs as an end-of-work check found nothing to add in audited threads.
    assert.notInclude(instructions, "list_thread_pull_requests");
  });

  it("waits on a PR only with the watch, never with a poll loop", () => {
    const instructions = buildRuntimeInstructions({ harness: "Codex" });

    assert.notInclude(instructions, "Creation, pending checks, or a merge ask alone is not enough");
    assert.include(instructions, "Links and watches persist across pushes.");
    // The wake message itself carries the do-not-re-watch rule.
    assert.notInclude(instructions, "On a wake");
    assert.include(
      instructions,
      "Call watch_pull_request when asked to monitor or babysit, or when work you were asked to do, such as a merge, still waits on checks or reviews, even after an earlier unwatch",
    );
    assert.notInclude(instructions, "merge it now");
    assert.include(instructions, "Otherwise act now or hand back.");
    assert.include(instructions, "then watch and end your turn");
    assert.include(instructions, "never watch, even if the brief says babysit");
    assert.include(
      instructions,
      "After PR work, a child's last line is: PR <full URL>, head <SHA>, checks and reviews <state>.",
    );
    assert.include(instructions, "Never wait with sleep");
    assert.include(instructions, "call unwatch_pull_request");
  });
});

it("persistent identity includes the editable role and exact native memory paths", () => {
  const instructions = buildPersistentAgentInstructions({
    name: "Edna",
    title: "Editorial assistant",
    instructions: "Review copy.",
    memoryDirectory: "/agents/edna/.claude/memory",
  });
  expect(instructions).toContain("You are Edna");
  expect(instructions).toContain("Your role: Editorial assistant.");
  expect(instructions).toContain("/agents/edna/.claude/memory/MEMORY.md");
  expect(instructions).toContain("Review copy.");
});

it("channel identity shares facts without resuming standalone work", () => {
  const instructions = buildPersistentAgentInstructions({
    name: "Edna",
    instructions: "Review copy.",
    memoryDirectory: "/agents/edna/.claude/memory",
    channelThreadId: "channel-design",
  });
  expect(instructions).toContain("independent channel conversation");
  expect(instructions).toContain("Do not read or write session-handoff.md");
  expect(instructions).not.toContain("/memory/session-handoff.md");
});

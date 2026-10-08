import { ProviderInstanceId, RunId, ThreadId } from "@elysiatools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { makeThreadShellFixture } from "../../test-fixtures";
import {
  delegatedAgentsStatusLabel,
  delegationShellRevisionToRefresh,
  delegationShellRevision,
} from "./delegatedAgentWork.logic";

describe("source delegated work", () => {
  it("follows member approval changes while the group's canonical conversation stays idle", () => {
    const group = makeThreadShellFixture({ id: ThreadId.make("group") });
    const lead = makeThreadShellFixture({ id: ThreadId.make("lead") });
    const member = makeThreadShellFixture({ id: ThreadId.make("member") });
    const previousRevision = delegationShellRevision(group, [lead, member]);
    expect(delegationShellRevision(group, [member, lead])).toBe(previousRevision);
    const currentRevision = delegationShellRevision(group, [
      { ...lead, hasPendingApprovals: true },
      member,
    ]);
    expect(delegationShellRevision(group)).toBe(delegationShellRevision({ ...group }));
    const input = { previousRevision, currentRevision, status: "working" as const, pending: false };
    expect(delegationShellRevisionToRefresh(input)).toBe(true);
    expect(delegationShellRevisionToRefresh({ ...input, pending: true })).toBe(false);
    expect(delegationShellRevisionToRefresh({ ...input, status: "completed" })).toBe(false);
  });
  it("rereads a retained active result on remount once, without duplicating initial or pending reads", () => {
    const input = {
      previousRevision: "already-completed-shell",
      currentRevision: "already-completed-shell",
      status: "working" as const,
      pending: false,
      cachedActiveOnMount: true,
    };
    expect(delegationShellRevisionToRefresh(input)).toBe(true);
    expect(delegationShellRevisionToRefresh({ ...input, pending: true })).toBe(false);
    expect(delegationShellRevisionToRefresh({ ...input, cachedActiveOnMount: false })).toBe(false);
    expect(delegationShellRevisionToRefresh({ ...input, status: null })).toBe(false);
    expect(delegationShellRevisionToRefresh({ ...input, status: "completed" })).toBe(false);
  });
  it("refreshes equal-timestamp native lifecycle and approval changes", () => {
    const shell = {
      updatedAt: "2026-10-02T00:00:00.000Z",
      latestRun: {
        runId: RunId.make("turn1"),
        status: "running" as const,
        requestedAt: "2026-10-02T00:00:00.000Z",
        startedAt: null,
        completedAt: null,
        assistantMessageId: null,
      },
      runtime: {
        providerInstanceId: ProviderInstanceId.make("claudeAgent"),
        status: "running" as const,
        providerName: "claude",
        runtimeMode: "full-access" as const,
        activeRunId: RunId.make("turn1"),
        lastError: null,
        updatedAt: "2026-10-02T00:00:00.000Z",
      },
      hasPendingApprovals: false,
      hasPendingUserInput: false,
    };
    const previousRevision = delegationShellRevision(shell);
    const completed = {
      ...shell,
      latestRun: { ...shell.latestRun, status: "completed" as const },
    };
    const waiting = { ...shell, hasPendingApprovals: true };
    const input = { ...shell, hasPendingUserInput: true };
    const anotherTurn = {
      ...shell,
      latestRun: { ...shell.latestRun, runId: RunId.make("turn2") },
    };
    const runtimeReady = { ...shell, runtime: { ...shell.runtime, status: "idle" as const } };
    const runtimeTurn = {
      ...shell,
      runtime: { ...shell.runtime, activeRunId: RunId.make("turn2") },
    };
    for (const changed of [completed, waiting, input, anotherTurn, runtimeReady, runtimeTurn]) {
      expect(changed.updatedAt).toBe(shell.updatedAt);
      expect(
        delegationShellRevisionToRefresh({
          previousRevision,
          currentRevision: delegationShellRevision(changed),
          status: "working",
          pending: false,
        }),
      ).toBe(true);
    }
    expect(
      delegationShellRevisionToRefresh({
        previousRevision,
        currentRevision: delegationShellRevision({ ...shell }),
        status: "working",
        pending: false,
      }),
    ).toBe(false);
  });

  it("coalesces shell changes during a read and stops following unrelated work after completion", () => {
    const input = {
      previousRevision: "first",
      currentRevision: "second",
      status: "working" as const,
      pending: false,
    };
    expect(delegationShellRevisionToRefresh(input)).toBe(true);
    expect(delegationShellRevisionToRefresh({ ...input, pending: true })).toBe(false);
    expect(delegationShellRevisionToRefresh({ ...input, previousRevision: "second" })).toBe(false);
    expect(delegationShellRevisionToRefresh({ ...input, status: "completed" })).toBe(false);
    expect(delegationShellRevisionToRefresh({ ...input, status: "error" })).toBe(false);
    expect(delegationShellRevisionToRefresh({ ...input, status: null })).toBe(false);
  });

  it("counts current working agents and reports terminal failures honestly", () => {
    expect(delegatedAgentsStatusLabel(["working", "completed", "queued"])).toBe("2 agents working");
    expect(delegatedAgentsStatusLabel(["working", "completed"])).toBe("1 agent working");
    expect(delegatedAgentsStatusLabel(["completed", "error"])).toBe("2 agents · Failed");
    expect(delegatedAgentsStatusLabel(["completed", "interrupted"])).toBe("2 agents · Stopped");
    expect(delegatedAgentsStatusLabel(["completed", "completed"])).toBe("2 agents · Completed");
  });
});

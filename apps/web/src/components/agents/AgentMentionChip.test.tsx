import * as DateTime from "effect/DateTime";
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  EnvironmentId,
  MessageId,
  ProjectId,
  ThreadId,
  type OrchestrationV2TurnItem,
  TurnItemId,
  type AgentGetDelegationResult,
} from "@elysiatools/contracts";
import { expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  sourceChannel: false,
  status: "working" as AgentGetDelegationResult["status"],
  statusByAgent: {} as Record<string, AgentGetDelegationResult["status"]>,
  activities: [] as OrchestrationV2TurnItem[],
  project: {
    title: "Friday",
    agentProfile: { archived: false, avatar: { preset: "triangle", color: "#EEAF00" } },
  } as
    | {
        title: string;
        agentProfile: { archived: boolean; avatar: { preset: string; color: string } };
      }
    | undefined,
}));
vi.mock("~/state/entities", () => ({
  useProject: (ref: { projectId: string } | null) =>
    ref?.projectId === "source-project"
      ? { agentProfile: state.sourceChannel ? { group: {} } : undefined }
      : state.project,
  useThreadShell: () => ({ projectId: "source-project" }),
  useThreadProjection: () => ({ projection: { turnItems: state.activities } }),
}));
vi.mock("./useDelegatedAgents", () => ({
  useDelegatedAgents: (
    _source: unknown,
    jobs: import("@elysiatools/shared/agentMentions").DelegatedAgent[],
  ) =>
    jobs.map((job) => ({
      job,
      name: job.agentName,
      working: (state.statusByAgent[job.agentProjectId] ?? state.status) === "working",
      data: {
        ...job,
        status: state.statusByAgent[job.agentProjectId] ?? state.status,
        messages: [],
        truncated: false,
      },
    })),
}));
import { useThreadOverviewStore } from "../chat/threadOverviewStore";
import { AgentMentionChip, AgentMessageStatus, SentAgentMentionChip } from "./AgentMentionChip";

it("resolves sent agent mentions to their avatar, retains archived history, and handles a missing agent", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = async (allowArchived = false, status?: AgentGetDelegationResult["status"]) =>
    act(async () =>
      root.render(
        <AgentMentionChip
          environmentId={EnvironmentId.make("local")}
          contextId="friday"
          label="@Friday"
          copyMarkdown="agent-reference"
          allowArchived={allowArchived}
          status={status}
        />,
      ),
    );
  try {
    await render();
    expect(host.textContent).toContain("Friday");
    expect(host.querySelector('path[fill="#EEAF00"]')).not.toBeNull();
    expect(host.querySelector('[data-markdown-copy="agent-reference"]')).not.toBeNull();
    await render(false, "working");
    expect(host.querySelector('[data-working="true"]')).not.toBeNull();
    await render(false, "completed");
    expect(host.querySelector('[data-working="true"]')).toBeNull();
    expect(host.querySelector('[data-working="false"]')).not.toBeNull();
    state.project!.agentProfile.archived = true;
    await render(true);
    expect(host.querySelector('path[fill="#EEAF00"]')).not.toBeNull();
    await render();
    expect(host.querySelector("[data-context-unresolved]")).not.toBeNull();
    state.project = undefined;
    await render(true);
    expect(host.textContent).toContain("Friday");
    expect(host.querySelector("[data-context-unresolved]")).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("shows plain clickable agent names and task-specific status in sent messages", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.project = {
    title: "Friday",
    agentProfile: { archived: false, avatar: { preset: "triangle", color: "#EEAF00" } },
  };
  state.status = "working";
  const activity = (message: string, agent: string): OrchestrationV2TurnItem => ({
    id: TurnItemId.make(`${message}-${agent}`),
    type: "system_notice",
    threadId: ThreadId.make("source"),
    runId: null,
    nodeId: null,
    status: "completed",
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 0,
    title: null,
    completedAt: null,
    startedAt: DateTime.makeUnsafe("2026-10-02T00:00:00.000Z"),
    updatedAt: DateTime.makeUnsafe("2026-10-02T00:00:00.000Z"),
    message: "Task delegated",
    agentDelegation: {
      agentProjectId: ProjectId.make(agent),
      agentThreadId: ThreadId.make(`chat-${agent}`),
      agentName: agent,
      sourceMessageId: MessageId.make(message),
      targetMessageId: MessageId.make(`target-${message}`),
      targetTurnId: null,
    },
  });
  state.activities = [
    activity("older", "friday"),
    activity("request", "other"),
    activity("request", "friday"),
  ];
  const source = { environmentId: EnvironmentId.make("local"), threadId: ThreadId.make("source") };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (agentProjectId?: ProjectId) =>
    root.render(
      <>
        <div data-bubble>
          <SentAgentMentionChip
            environmentId={source.environmentId}
            contextId="friday"
            label="@Friday"
            sourceThreadRef={source}
            sourceMessageId={MessageId.make("request")}
            allowArchived
          />
        </div>
        <AgentMessageStatus
          sourceThreadRef={source}
          sourceMessageId={MessageId.make("request")}
          {...(agentProjectId ? { agentProjectId } : {})}
        />
      </>,
    );
  try {
    await act(async () => render());
    expect(host.textContent).toBe("FridayWorking");
    expect(host.querySelector('[data-bubble] [role="status"]')).toBeNull();
    expect(host.querySelector('[aria-label="Agents working"]')).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
    expect(useThreadOverviewStore.getState().target).toEqual({
      source,
      projectId: ProjectId.make("friday"),
    });
    state.sourceChannel = true;
    useThreadOverviewStore.setState({ target: null });
    await act(async () => render());
    expect(host.querySelector("[data-bubble] button")).toBeNull();
    expect(useThreadOverviewStore.getState().target).toBeNull();
    state.sourceChannel = false;
    state.status = "completed";
    await act(async () => render());
    expect(host.querySelector('[aria-label="Agents working"]')).toBeNull();
    expect(host.querySelector('[aria-label="Agents finished"]')).not.toBeNull();
    expect(host.textContent).toBe("Friday");
    state.status = "error";
    await act(async () => render());
    expect(host.querySelector('[aria-label="Agents need attention"]')).not.toBeNull();
    state.status = "interrupted";
    await act(async () => render());
    expect(host.querySelector('[aria-label="Agents stopped"]')).not.toBeNull();
    state.statusByAgent = { friday: "completed", other: "working" };
    await act(async () => render(ProjectId.make("friday")));
    expect(host.querySelector('[aria-label="Agents finished"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Agents working"]')).toBeNull();
    state.activities = [activity("older", "friday"), activity("another-request", "other")];
    await act(async () => render());
    expect(host.querySelector('[aria-label="Agents finished"]')).toBeNull();
  } finally {
    state.sourceChannel = false;
    state.statusByAgent = {};
    useThreadOverviewStore.setState({ target: null });
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

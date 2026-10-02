// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  EnvironmentId,
  EventId,
  MessageId,
  ProjectId,
  ThreadId,
  type OrchestrationThreadActivity,
  type AgentGetDelegationResult,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  status: "working" as AgentGetDelegationResult["status"],
  activities: [] as OrchestrationThreadActivity[],
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
  useProject: () => state.project,
  useThreadDetail: () => ({ activities: state.activities }),
}));
vi.mock("./useDelegatedAgents", () => ({
  useDelegatedAgents: (
    _source: unknown,
    jobs: import("@t3tools/shared/agentMentions").DelegatedAgent[],
  ) =>
    jobs.map((job) => ({
      job,
      name: job.agentName,
      working: state.status === "working",
      data: { ...job, status: state.status, messages: [], truncated: false },
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
  const activity = (message: string, agent: string): OrchestrationThreadActivity => ({
    id: EventId.make(`${message}-${agent}`),
    tone: "info",
    kind: "agent.delegated",
    summary: "Task delegated",
    turnId: null,
    createdAt: "2026-10-02T00:00:00.000Z",
    payload: {
      agentProjectId: agent,
      agentThreadId: `chat-${agent}`,
      agentName: agent,
      sourceMessageId: message,
      targetMessageId: `target-${message}`,
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
  const render = () =>
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
        <AgentMessageStatus sourceThreadRef={source} sourceMessageId={MessageId.make("request")} />
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
    state.activities = [activity("older", "friday"), activity("another-request", "other")];
    await act(async () => render());
    expect(host.querySelector('[aria-label="Agents finished"]')).toBeNull();
  } finally {
    useThreadOverviewStore.setState({ target: null });
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

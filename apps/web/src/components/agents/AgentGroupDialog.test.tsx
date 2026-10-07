// @vitest-environment jsdom
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type AgentProfile,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { AgentRosterEntry } from "./useAgents";

const state = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  navigate: vi.fn(),
  close: vi.fn(),
  router: { latestLocation: { href: "/agents" } },
}));
const environmentId = EnvironmentId.make("local");
vi.mock("../../state/entities", () => ({ useProjects: () => [] }));
vi.mock("../../state/environments", () => ({
  usePrimaryEnvironmentId: () => environmentId,
  useEnvironments: () => ({ environments: [] }),
}));
vi.mock("../../state/projects", () => ({
  projectEnvironment: { createAgent: "create", update: "update" },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (command === "create" ? state.create : state.update),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
  useRouter: () => state.router,
}));
import { AgentGroupDialog } from "./AgentGroupDialog";
import { clearAgentCreationDraft } from "./agentDialogStore";
import { useConversationTabsStore } from "../../conversationTabsStore";

const profile: AgentProfile = {
  title: "Research",
  instructions: "Research tasks",
  avatar: { preset: "square", color: "#28B4FF" },
  notificationsEnabled: true,
  archived: false,
};
function agent(id: string): AgentRosterEntry {
  return {
    project: {
      id: ProjectId.make(id),
      environmentId,
      title: id,
      workspaceRoot: `/agents/${id}`,
      repositoryIdentity: null,
      defaultModelSelection: { instanceId: ProviderInstanceId.make("elysia"), model: "native" },
      scripts: [],
      createdAt: "2026-10-03T12:00:00.000Z",
      updatedAt: "2026-10-03T12:00:00.000Z",
      agentProfile: profile,
    },
    thread: null,
    busy: false,
  };
}
const agents = [agent("Alice"), agent("Bob"), agent("Charlie")];
let root: Root;
let host: HTMLDivElement;
const submit = () =>
  document
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  clearAgentCreationDraft(true);
  useConversationTabsStore.setState({ tabs: [], activeId: null });
  state.create.mockReset().mockResolvedValue(
    AsyncResult.success({
      projectId: ProjectId.make("group"),
      threadId: ThreadId.make("group-thread"),
    }),
  );
  state.update.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  state.navigate.mockReset();
  state.close.mockReset();
  state.router.latestLocation.href = "/agents";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  Reflect.deleteProperty(Element.prototype, "getAnimations");
  vi.unstubAllGlobals();
});

it("changes lead when deselected and creates the native group conversation with remaining members", async () => {
  await act(async () => root.render(<AgentGroupDialog agents={agents} onClose={state.close} />));
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Channel name"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Team");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const boxes = [...document.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')];
  await act(async () => boxes[2]!.click());
  await act(async () => boxes[0]!.click());
  expect(document.querySelector('[aria-label="Lead agent"]')?.textContent).toContain("Bob");
  await act(async () => {
    submit();
  });
  expect(state.create.mock.calls[0]?.[0]).toMatchObject({
    environmentId,
    input: {
      name: "Team",
      agentProfile: {
        group: {
          memberProjectIds: [ProjectId.make("Bob"), ProjectId.make("Charlie")],
          leadProjectId: ProjectId.make("Bob"),
        },
      },
      defaultModelSelection: agents[1]!.project.defaultModelSelection,
    },
  });
  expect(state.navigate).toHaveBeenCalledWith({
    to: "/$environmentId/$threadId",
    params: { environmentId, threadId: ThreadId.make("group-thread") },
  });
});

it("keeps failed edits open for retry and preserves the durable conversation in the update", async () => {
  const existing = agent("Team");
  existing.project = {
    ...existing.project,
    agentProfile: {
      ...profile,
      conversationThreadId: ThreadId.make("durable"),
      group: {
        memberProjectIds: [agents[0]!.project.id, agents[1]!.project.id],
        leadProjectId: agents[0]!.project.id,
      },
    },
  };
  state.update.mockResolvedValueOnce(AsyncResult.failure(Cause.fail(new Error("Save failed"))));
  await act(async () =>
    root.render(<AgentGroupDialog agents={agents} existing={existing} onClose={state.close} />),
  );
  await act(async () => {
    submit();
  });
  expect(document.querySelector('[role="alert"]')?.textContent).toBe("Save failed");
  expect(state.close).not.toHaveBeenCalled();
  expect(state.update.mock.calls[0]?.[0]).toMatchObject({
    input: {
      projectId: existing.project.id,
      agentProfile: { conversationThreadId: ThreadId.make("durable") },
    },
  });
  await act(async () => {
    submit();
  });
  expect(state.update).toHaveBeenCalledTimes(2);
  expect(state.close).toHaveBeenCalledOnce();
});

it("preserves a page draft and replaces its creation tab with the saved channel conversation", async () => {
  useConversationTabsStore.getState().open({ kind: "agent-create", channel: true });
  const tabId = useConversationTabsStore.getState().activeId;
  const render = () => root.render(<AgentGroupDialog agents={agents} page onClose={state.close} />);
  await act(async () => render());
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Channel name"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Team");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => root.render(null));
  await act(async () => render());
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Channel name"]')!.value).toBe(
    "Team",
  );
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => submit());
  expect(useConversationTabsStore.getState().activeId).toBe(tabId);
  expect(useConversationTabsStore.getState().tabs.map((tab) => tab.target)).toEqual([
    { kind: "server", threadRef: { environmentId, threadId: "group-thread" } },
  ]);
  expect(state.navigate).toHaveBeenCalledWith({
    to: "/$environmentId/$threadId",
    params: { environmentId, threadId: "group-thread" },
  });
  expect(state.close).not.toHaveBeenCalled();
});

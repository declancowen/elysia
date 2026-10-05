// @vitest-environment jsdom
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId, PageId, WorkTaskId } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { DraftId } from "../composerDraftStore";
import { useConversationTabsStore, type ConversationTabTarget } from "../conversationTabsStore";
import { useAgentSidebarStore } from "../components/agents/agentSidebarStore";
import {
  useConversationTabNavigation,
  useConversationSectionNavigation,
} from "./useConversationTabNavigation";

const state = vi.hoisted(() => ({ navigate: vi.fn(), agent: false }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => state.navigate }));
vi.mock("../state/entities", () => ({
  readThreadShell: () => ({ projectId: "project" }),
  readProject: () => ({ agentProfile: state.agent ? { name: "Agent" } : null }),
}));
vi.mock("../components/pullRequest/pullRequestListPreferences", () => ({
  readPullRequestListPreferences: () => ({ involvement: "reviewRequested", state: "closed" }),
}));
let root: Root;
let host: HTMLDivElement;
let navigateSection: ReturnType<typeof useConversationSectionNavigation>;
let navigateTab: ReturnType<typeof useConversationTabNavigation>;
function Harness() {
  navigateTab = useConversationTabNavigation();
  navigateSection = useConversationSectionNavigation();
  return null;
}
beforeEach(async () => {
  state.navigate.mockClear();
  state.agent = false;
  useConversationTabsStore.setState({ tabs: [], activeId: null });
  useAgentSidebarStore.setState({ active: false });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const conversation: ConversationTabTarget = {
  kind: "server",
  threadRef: scopeThreadRef(EnvironmentId.make("remote"), ThreadId.make("agent")),
};
it("selects the Agents sidebar for agent/channel conversations and Workspace for project threads", async () => {
  state.agent = true;
  await act(async () => navigateTab(conversation));
  expect(useAgentSidebarStore.getState().active).toBe(true);
  expect(state.navigate).toHaveBeenLastCalledWith({
    to: "/$environmentId/$threadId",
    params: { environmentId: "remote", threadId: "agent" },
    replace: false,
  });
  state.agent = false;
  await act(async () => navigateTab(conversation));
  expect(useAgentSidebarStore.getState().active).toBe(false);
});
it("returns drafts to Workspace and preserves replacement redirects", async () => {
  useAgentSidebarStore.setState({ active: true });
  await act(async () => navigateTab({ kind: "draft", draftId: DraftId.make("draft") }, true));
  expect(useAgentSidebarStore.getState().active).toBe(false);
  expect(state.navigate).toHaveBeenLastCalledWith({
    to: "/draft/$draftId",
    params: { draftId: "draft" },
    replace: true,
  });
});
it("keeps the PR list filters while serializing the tab's exact server, project, host and PR identity", async () => {
  useAgentSidebarStore.setState({ active: true });
  await act(async () =>
    navigateTab({
      kind: "pull-request",
      environmentId: EnvironmentId.make("remote"),
      projectId: ProjectId.make("project"),
      host: "github.company.com",
      repository: "company/repo",
      number: 42,
    }),
  );
  expect(useAgentSidebarStore.getState().active).toBe(false);
  expect(state.navigate).toHaveBeenLastCalledWith({
    to: "/pull-requests",
    replace: false,
    search: {
      involvement: "reviewRequested",
      state: "closed",
      repository: "company/repo",
      number: 42,
      selectedHost: "github.company.com",
      selectedProjectId: "project",
      selectedEnvironmentId: "remote",
    },
  });
});

it("reuses a section's existing tab and adds a first section tab without replacing the previous view", async () => {
  const store = useConversationTabsStore.getState();
  store.open(conversation);
  store.open(
    {
      kind: "pull-request",
      environmentId: EnvironmentId.make("remote"),
      projectId: ProjectId.make("project"),
      host: "github.com",
      repository: "company/repo",
      number: 42,
    },
    true,
  );
  const firstId = useConversationTabsStore.getState().tabs[0]!.id;
  await act(async () => {
    expect(navigateSection("workspace")).toBe(true);
  });
  expect(useConversationTabsStore.getState().activeId).toBe(firstId);
  expect(useConversationTabsStore.getState().tabs).toHaveLength(2);
  await act(async () => {
    expect(navigateSection("agents")).toBe(false);
  });
  store.open({
    kind: "server",
    threadRef: scopeThreadRef(EnvironmentId.make("remote"), ThreadId.make("other-agent")),
  });
  expect(useConversationTabsStore.getState().tabs).toHaveLength(3);
});

it("navigates page and task tabs to their existing editors and restores them from the rail", async () => {
  const page: ConversationTabTarget = {
    kind: "page",
    environmentId: EnvironmentId.make("local"),
    id: PageId.make("page-00000000-0000-0000-0000-000000000001"),
    title: "Notes",
  };
  const task: ConversationTabTarget = {
    kind: "task",
    environmentId: EnvironmentId.make("local"),
    id: WorkTaskId.make("TASK-1"),
    title: "Build",
  };
  const tabs = useConversationTabsStore.getState();
  tabs.open(page);
  tabs.open(task, true);
  useAgentSidebarStore.setState({ active: true });
  await act(async () => expect(navigateSection("pages")).toBe(true));
  expect(state.navigate).toHaveBeenLastCalledWith({
    to: "/pages/$pageId",
    params: { pageId: page.id },
    replace: false,
  });
  expect(useAgentSidebarStore.getState().active).toBe(false);
  await act(async () => expect(navigateSection("tasks")).toBe(true));
  expect(state.navigate).toHaveBeenLastCalledWith({
    to: "/tasks",
    search: { task: task.id },
    replace: false,
  });
  await act(async () => navigateTab({ ...page, id: null, title: "Pages" }));
  expect(state.navigate).toHaveBeenLastCalledWith({ to: "/pages", replace: false });
  await act(async () => navigateTab({ ...task, id: null, title: "Tasks" }));
  expect(state.navigate).toHaveBeenLastCalledWith({ to: "/tasks", search: {}, replace: false });
});

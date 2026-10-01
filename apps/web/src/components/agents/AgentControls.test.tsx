// @vitest-environment jsdom
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type AgentProfile,
} from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { Project, SidebarThreadSummary } from "../../types";
import { useUiStateStore } from "../../uiStateStore";

type UpdateInput = {
  environmentId: EnvironmentId;
  input: { projectId: ProjectId; agentProfile: AgentProfile };
};
const state = vi.hoisted(() => ({
  projects: [] as Project[],
  threads: [] as SidebarThreadSummary[],
  navigate: vi.fn(),
  update: vi.fn<(input: UpdateInput) => Promise<AtomCommandResult<void, Error>>>(),
  unarchive: vi.fn(),
  contextMenu: vi.fn(),
  toast: vi.fn(),
  mobile: false,
  sidebarOpen: false,
  setOpenMobile: vi.fn(),
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => state.projects,
  useThreadShells: () => state.threads,
}));
vi.mock("../../state/projects", () => ({ projectEnvironment: { update: "update" } }));
vi.mock("../../state/threads", () => ({ threadEnvironment: { unarchive: "unarchive" } }));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (command === "update" ? state.update : state.unarchive),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
  useParams: () => ({ environmentId: "local", threadId: "ordinary-chat" }),
}));
vi.mock("../../localApi", () => ({
  readLocalApi: () => ({ contextMenu: { show: state.contextMenu } }),
}));
vi.mock("../ui/sidebar", () => ({
  useSidebar: () => ({ isMobile: state.mobile, setOpenMobile: state.setOpenMobile }),
}));
vi.mock("../ui/toast", () => ({ toastManager: { add: state.toast } }));

import { AgentDetailsPopover } from "./AgentDetailsPopover";
import { AgentRoster } from "./AgentRoster";
import { closeAgentDialog, useAgentDialogStore } from "./agentDialogStore";

const environmentId = EnvironmentId.make("local");
const projectId = ProjectId.make("agent-workspace");
const threadId = ThreadId.make("durable-agent-chat");
const modelSelection = { instanceId: ProviderInstanceId.make("elysia"), model: "native-model" };
const profile: AgentProfile = {
  instructions: "Research carefully and remember decisions.",
  title: "Researcher",
  avatar: { preset: "brain", color: "#C9FCED" },
  archived: false,
  notificationsEnabled: true,
  conversationThreadId: threadId,
};
const project: Project = {
  environmentId,
  id: projectId,
  title: "Alex",
  workspaceRoot: "/agents/alex",
  repositoryIdentity: null,
  defaultModelSelection: modelSelection,
  agentProfile: profile,
  scripts: [],
  createdAt: "2026-10-01T09:00:00Z",
  updatedAt: "2026-10-01T09:00:00Z",
};
const thread: SidebarThreadSummary = {
  environmentId,
  id: threadId,
  projectId,
  title: "Alex",
  modelSelection,
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  pullRequests: [],
  latestTurn: null,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  session: null,
  latestUserMessageAt: null,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
};
const initialExpansion = useUiStateStore.getState().projectExpandedById;
let host: HTMLDivElement;
let root: Root;
async function render(current = true, roster = false) {
  await act(async () =>
    root.render(
      roster ? (
        <AgentRoster />
      ) : (
        <AgentDetailsPopover
          projectRef={current ? scopeProjectRef(environmentId, projectId) : null}
        />
      ),
    ),
  );
}
function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.getAttribute("aria-label") === label || button.textContent?.trim() === label,
  )!;
}
async function click(label: string) {
  expect(button(label), label).toBeDefined();
  await act(async () => button(label).click());
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  useUiStateStore.setState({ projectExpandedById: {} });
  state.projects = [
    project,
    {
      ...project,
      id: ProjectId.make("archived-agent"),
      title: "Archived person",
      agentProfile: { ...profile, archived: true },
    },
  ];
  state.threads = [thread];
  state.navigate.mockReset().mockResolvedValue(undefined);
  state.update.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  state.unarchive.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  state.contextMenu.mockReset().mockResolvedValue("edit-agent");
  state.toast.mockReset();
  state.mobile = false;
  state.sidebarOpen = false;
  state.setOpenMobile.mockReset().mockImplementation((open: boolean) => {
    state.sidebarOpen = open;
  });
  closeAgentDialog();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useUiStateStore.setState({ projectExpandedById: initialExpansion });
  closeAgentDialog();
  vi.unstubAllGlobals();
});

it("opens current-agent details and edits through the global dialog without changing chats", async () => {
  await render();
  await click("Manage Alex");
  expect(document.body.textContent).toContain(profile.instructions);
  expect(document.body.textContent).toContain(modelSelection.model);
  await click("Edit agent");
  expect(useAgentDialogStore.getState().target?.projectRef).toEqual(
    scopeProjectRef(environmentId, projectId),
  );
  expect(document.querySelector('[data-slot="popover-popup"]')).toBeNull();
  expect(state.navigate).not.toHaveBeenCalled();
});

it("opens from the roster and recovers the linked legacy archived conversation", async () => {
  state.threads = [{ ...thread, archivedAt: "2026-10-01T10:00:00Z" }];
  await render(false, true);
  expect(document.body.textContent).toContain("Alex");
  expect(document.body.textContent).not.toContain("Archived person");
  await click("AlexResearcher");
  expect(state.unarchive).toHaveBeenCalledWith({ environmentId, input: { threadId } });
  expect(state.navigate).toHaveBeenCalledWith({
    to: "/$environmentId/$threadId",
    params: { environmentId, threadId },
  });
  expect(state.unarchive.mock.invocationCallOrder[0]).toBeLessThan(
    state.navigate.mock.invocationCallOrder[0]!,
  );
  expect(document.querySelector('[data-slot="popover-popup"]')).toBeNull();
});

it("shows agent management only for the current agent and keeps create/archive access in the right places", async () => {
  await render(false);
  expect(host.querySelector("button")).toBeNull();
  await render(false, true);
  await click("Create new agent");
  expect(useAgentDialogStore.getState().target).toEqual({ projectRef: null });
  closeAgentDialog();
  await render();
  await click("Manage Alex");
  await click("Archived agents");
  expect(state.navigate).toHaveBeenCalledWith({ to: "/settings/archived" });
});

it("collapses Agents even when empty, persists across remounts, and expands when creating", async () => {
  state.projects = [];
  await render(false, true);
  expect(host.textContent).toContain("Create your first agent");
  await click("Agents");
  expect(host.textContent).not.toContain("Create your first agent");
  expect(button("Agents").getAttribute("aria-expanded")).toBe("false");
  await act(async () => root.render(null));
  await render(false, true);
  expect(button("Agents").getAttribute("aria-expanded")).toBe("false");
  await click("Create new agent");
  expect(button("Agents").getAttribute("aria-expanded")).toBe("true");
  expect(host.textContent).toContain("Create your first agent");
  expect(useAgentDialogStore.getState().target).toEqual({ projectRef: null });
});

it("archives directly from the roster without opening the chat and blocks the action while working", async () => {
  await render(false, true);
  await click("Archive Alex");
  expect(state.update).toHaveBeenCalledWith({
    environmentId,
    input: { projectId, agentProfile: { ...profile, archived: true } },
  });
  expect(state.navigate).not.toHaveBeenCalled();
  state.threads = [{ ...thread, backgroundLiveness: "monitoring" }];
  await render(false, true);
  expect(button("Archive Alex").disabled).toBe(true);
  await click("Archive Alex");
  expect(state.update).toHaveBeenCalledOnce();
});

it("archives only the profile once while pending, preserving the linked conversation and retrying failures", async () => {
  let complete!: (result: AtomCommandResult<void, Error>) => void;
  state.update.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await render();
  await click("Manage Alex");
  await act(async () => {
    button("Archive").click();
    button("Archive").click();
  });
  expect(state.update).toHaveBeenCalledOnce();
  expect(state.update).toHaveBeenCalledWith({
    environmentId,
    input: { projectId, agentProfile: { ...profile, archived: true } },
  });
  expect(button("Archiving…").disabled).toBe(true);
  await act(async () => complete(AsyncResult.failure(Cause.fail(new Error("Offline")))));
  expect(state.toast).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Could not archive agent", description: "Offline" }),
  );
  expect(document.querySelector('[data-slot="popover-popup"]')).not.toBeNull();
  state.update.mockResolvedValue(AsyncResult.success(undefined));
  await click("Archive");
  expect(state.update).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[data-slot="popover-popup"]')).toBeNull();
  expect(state.unarchive).not.toHaveBeenCalled();
});

it("blocks archiving during native work", async () => {
  state.threads = [{ ...thread, backgroundLiveness: "monitoring" }];
  await render();
  await click("Manage Alex");
  expect(button("Archive").disabled).toBe(true);
  expect(document.body.textContent).toContain("Wait for the current task to finish");
  await click("Archive");
  expect(state.update).not.toHaveBeenCalled();
});

it("right-click edits from another chat through the existing context menu and hides archived agents in the roster", async () => {
  await render(false, true);
  expect(host.textContent).not.toContain("Archived person");
  expect(host.textContent).not.toContain("Archived agents");
  await act(async () =>
    button("AlexResearcher").dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, clientX: 20, clientY: 30 }),
    ),
  );
  expect(state.contextMenu).toHaveBeenCalledWith([{ id: "edit-agent", label: "Edit agent" }], {
    x: 20,
    y: 30,
  });
  expect(useAgentDialogStore.getState().target?.projectRef).toEqual(
    scopeProjectRef(environmentId, projectId),
  );
  expect(state.navigate).not.toHaveBeenCalled();
  closeAgentDialog();
  state.contextMenu.mockResolvedValue(null);
  await act(async () =>
    button("AlexResearcher").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })),
  );
  expect(useAgentDialogStore.getState().target).toBeNull();
});

it("closes the narrow sidebar only after its linked agent conversation opens successfully", async () => {
  state.mobile = true;
  state.threads = [{ ...thread, archivedAt: "2026-10-01T10:00:00Z" }];
  state.unarchive.mockResolvedValue(AsyncResult.failure(Cause.fail(new Error("Offline"))));
  await render(false, true);
  await click("AlexResearcher");
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.setOpenMobile).not.toHaveBeenCalled();
  state.unarchive.mockResolvedValue(AsyncResult.success(undefined));
  await click("AlexResearcher");
  expect(state.navigate).toHaveBeenCalledOnce();
  expect(state.setOpenMobile).toHaveBeenCalledWith(false);
});

it("dismisses the narrow sidebar when creating from either entry point or editing from the row menu", async () => {
  state.mobile = true;
  state.sidebarOpen = true;
  await render(false, true);
  await click("Create new agent");
  expect(useAgentDialogStore.getState().target).toEqual({ projectRef: null });
  expect(state.sidebarOpen).toBe(false);

  closeAgentDialog();
  state.sidebarOpen = true;
  state.projects = [];
  await render(false, true);
  await click("Create your first agent");
  expect(useAgentDialogStore.getState().target).toEqual({ projectRef: null });
  expect(state.sidebarOpen).toBe(false);

  closeAgentDialog();
  state.sidebarOpen = true;
  state.projects = [project];
  await render(false, true);
  await click("Actions for Alex");
  const editAction = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent?.trim() === "Edit agent",
  );
  expect(editAction).toBeDefined();
  await act(async () => editAction!.click());
  expect(useAgentDialogStore.getState().target?.projectRef).toEqual(
    scopeProjectRef(environmentId, projectId),
  );
  expect(state.sidebarOpen).toBe(false);
  expect(state.navigate).not.toHaveBeenCalled();
});

it("keeps the narrow sidebar open on context-menu cancellation and dismisses it only when editing", async () => {
  state.mobile = true;
  state.sidebarOpen = true;
  state.contextMenu.mockResolvedValue(null);
  await render(false, true);
  const rightClickAgent = async () => {
    await act(async () =>
      button("AlexResearcher").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })),
    );
  };
  await rightClickAgent();
  expect(useAgentDialogStore.getState().target).toBeNull();
  expect(state.sidebarOpen).toBe(true);

  state.contextMenu.mockResolvedValue("edit-agent");
  await rightClickAgent();
  expect(useAgentDialogStore.getState().target?.projectRef).toEqual(
    scopeProjectRef(environmentId, projectId),
  );
  expect(state.sidebarOpen).toBe(false);
  expect(state.navigate).not.toHaveBeenCalled();
});

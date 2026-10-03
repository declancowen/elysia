import { makeThreadFixture } from "../../test-fixtures";
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
import Edit03Icon from "@hugeicons/core-free-icons/Edit03Icon";
import ArchiveOff03Icon from "@hugeicons/core-free-icons/ArchiveOff03Icon";
import { derivePhysicalProjectKey } from "../../logicalProject";
import type { Project, SidebarThreadSummary } from "../../types";
import { useUiStateStore } from "../../uiStateStore";
import { dismissContextMenu } from "../../contextMenuFallback";

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
  activeThreadId: "ordinary-chat",
  sidebarOpen: false,
  setOpenMobile: vi.fn(),
  elysia: true,
}));
vi.mock("@t3tools/contracts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@t3tools/contracts")>()),
  get SINGLE_PROVIDER_UI() {
    return state.elysia;
  },
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
  useParams: () => ({ environmentId: "local", threadId: state.activeThreadId }),
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
const thread: SidebarThreadSummary = makeThreadFixture({
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
  latestRun: null,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  runtime: null,
  latestUserMessageAt: null,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
});
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
  state.activeThreadId = "ordinary-chat";
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
  state.elysia = true;
  state.sidebarOpen = false;
  state.setOpenMobile.mockReset().mockImplementation((open: boolean) => {
    state.sidebarOpen = open;
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  closeAgentDialog();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => dismissContextMenu());
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
  expect(button("Edit agent").querySelector("path")?.getAttribute("d")).toBe(Edit03Icon[0]![1].d);
  expect(button("Edit agent").querySelector("path")?.getAttribute("stroke-width")).toBe("2");
  await click("Edit agent");
  expect(useAgentDialogStore.getState().target?.projectRef).toEqual(
    scopeProjectRef(environmentId, projectId),
  );
  expect(document.querySelector('[data-slot="popover-popup"]')).toBeNull();
  expect(state.navigate).not.toHaveBeenCalled();
});

it("opens scheduled tasks scoped to the current agent and closes the profile", async () => {
  await render();
  await click("Manage Alex");
  await click("Scheduled tasks");
  expect(state.navigate).toHaveBeenCalledWith({
    to: "/settings/scheduled-tasks",
    search: {
      project: derivePhysicalProjectKey(project),
      machine: environmentId,
      checkout: undefined,
    },
  });
  expect(document.querySelector('[data-slot="popover-popup"]')).toBeNull();
  expect(state.update).not.toHaveBeenCalled();
});

it("fits the popover avatar to changing name and role height without unbounded growth", async () => {
  const name = "A long agent name ".repeat(10);
  const role = "A long agent role ".repeat(10);
  state.projects = [{ ...project, title: name, agentProfile: { ...profile, title: role } }];
  let height = 44;
  let resizeLabel: (() => void) | undefined;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly resized: () => void) {}
      observe(element: Element) {
        if (element.textContent === name + role) resizeLabel = this.resized;
      }
      unobserve() {}
      disconnect() {}
    },
  );
  const measure = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      return new DOMRect(0, 0, 200, this.textContent === name + role ? height : 0);
    });
  try {
    await render();
    await click(`Manage ${name}`);
    const avatar = document.querySelector<HTMLElement>(
      '[data-slot="popover-popup"] .agent-avatar',
    )!;
    expect(avatar.style.height).toBe("44px");
    expect(resizeLabel).toBeDefined();
    height = 240;
    await act(async () => resizeLabel!());
    expect(avatar.style.height).toBe("64px");
    height = 34;
    await act(async () => resizeLabel!());
    expect(avatar.style.height).toBe("34px");
    expect(document.body.textContent).toContain(name + role);
  } finally {
    measure.mockRestore();
  }
});

it("opens from the roster and recovers the linked legacy archived conversation", async () => {
  state.threads = [{ ...thread, archivedAt: "2026-10-01T10:00:00Z" }];
  await render(false, true);
  expect(document.body.textContent).toContain("Alex");
  expect(document.body.textContent).not.toContain(profile.title);
  expect(document.body.textContent).not.toContain("Archived person");
  await click("Alex");
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
  expect(button("Archived agents").querySelector("path")?.getAttribute("d")).toBe(
    ArchiveOff03Icon[0]![1].d,
  );
  expect(button("Archived agents").querySelector("path")?.getAttribute("stroke-width")).toBe("2");
  await click("Archived agents");
  expect(state.navigate).toHaveBeenCalledWith({ to: "/settings/archived" });
});

it("collapses Agents even when empty, persists across remounts, and expands when creating", async () => {
  state.projects = [];
  await render(false, true);
  expect(host.textContent).toContain("No agents yet");
  await click("Agents");
  expect(host.textContent).not.toContain("No agents yet");
  expect(button("Agents").getAttribute("aria-expanded")).toBe("false");
  await act(async () => root.render(null));
  await render(false, true);
  expect(button("Agents").getAttribute("aria-expanded")).toBe("false");
  await click("Create new agent");
  expect(button("Agents").getAttribute("aria-expanded")).toBe("true");
  expect(host.textContent).toContain("No agents yet");
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
  state.threads = [
    {
      ...thread,
      runtime: {
        status: "waiting",
        activeRunId: null,
        providerInstanceId: modelSelection.instanceId,
        providerName: "claudeAgent",
        lastError: null,
        updatedAt: thread.updatedAt,
      },
    },
  ];
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
  state.threads = [
    {
      ...thread,
      runtime: {
        status: "waiting",
        activeRunId: null,
        providerInstanceId: modelSelection.instanceId,
        providerName: "claudeAgent",
        lastError: null,
        updatedAt: thread.updatedAt,
      },
    },
  ];
  await render();
  await click("Manage Alex");
  expect(button("Archive").disabled).toBe(true);
  expect(document.body.textContent).toContain("Wait for the current task to finish");
  await click("Archive");
  expect(state.update).not.toHaveBeenCalled();
});

it.each([true, false])(
  "right-click edits from another chat and hides archived agents (Elysia: %s)",
  async (elysia) => {
    state.elysia = elysia;
    await render(false, true);
    expect(host.textContent).not.toContain("Archived person");
    expect(host.textContent).not.toContain("Archived agents");
    await act(async () =>
      button("Alex").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 20, clientY: 30 }),
      ),
    );
    if (elysia) {
      expect(state.contextMenu).not.toHaveBeenCalled();
      expect(button("Edit agent").querySelector("path")?.getAttribute("d")).toBe(
        Edit03Icon[0]![1].d,
      );
      expect(button("Edit agent").querySelector("svg")?.getAttribute("stroke-width")).toBe("2");
      await click("Edit agent");
    } else {
      expect(state.contextMenu).toHaveBeenCalledWith(
        [{ id: "edit-agent", label: "Edit agent", icon: "edit-03" }],
        { x: 20, y: 30 },
      );
    }
    expect(useAgentDialogStore.getState().target?.projectRef).toEqual(
      scopeProjectRef(environmentId, projectId),
    );
    expect(state.navigate).not.toHaveBeenCalled();
    closeAgentDialog();
    state.contextMenu.mockResolvedValue(null);
    await act(async () =>
      button("Alex").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })),
    );
    if (elysia)
      await act(async () =>
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
      );
    expect(useAgentDialogStore.getState().target).toBeNull();
  },
);

it("closes the narrow sidebar only after its linked agent conversation opens successfully", async () => {
  state.mobile = true;
  state.threads = [{ ...thread, archivedAt: "2026-10-01T10:00:00Z" }];
  state.unarchive.mockResolvedValue(AsyncResult.failure(Cause.fail(new Error("Offline"))));
  await render(false, true);
  await click("Alex");
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.setOpenMobile).not.toHaveBeenCalled();
  state.unarchive.mockResolvedValue(AsyncResult.success(undefined));
  await click("Alex");
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
  await click("No agents yet");
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
  expect(editAction!.querySelector("path")?.getAttribute("d")).toBe(Edit03Icon[0]![1].d);
  expect(editAction!.querySelector("path")?.getAttribute("stroke-width")).toBe("2");
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
      button("Alex").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })),
    );
  };
  await rightClickAgent();
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(useAgentDialogStore.getState().target).toBeNull();
  expect(state.sidebarOpen).toBe(true);

  state.contextMenu.mockResolvedValue("edit-agent");
  await rightClickAgent();
  await click("Edit agent");
  expect(useAgentDialogStore.getState().target?.projectRef).toEqual(
    scopeProjectRef(environmentId, projectId),
  );
  expect(state.sidebarOpen).toBe(false);
  expect(state.navigate).not.toHaveBeenCalled();
});

it("keeps the current agent visible while Agents is collapsed and hides it after leaving", async () => {
  state.activeThreadId = threadId;
  await render(false, true);
  await click("Agents");
  expect(host.textContent).toContain("Alex");
  expect(host.querySelector('[aria-current="page"]')).not.toBeNull();
  state.activeThreadId = "ordinary-chat";
  await render(false, true);
  expect(host.textContent).not.toContain("Alex");
  await click("Agents");
  expect(host.textContent).toContain("Alex");
});

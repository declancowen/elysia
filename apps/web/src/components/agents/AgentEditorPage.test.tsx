import { makeThreadFixture } from "../../test-fixtures";
// @vitest-environment jsdom
import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type AgentCreateResult,
} from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useSearch,
} from "@tanstack/react-router";
import { AsyncResult } from "effect/unstable/reactivity";
import * as Cause from "effect/Cause";
import { act, useSyncExternalStore, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { Project, SidebarThreadSummary } from "../../types";

const state = vi.hoisted(() => ({
  projects: [] as Project[],
  threads: [] as SidebarThreadSummary[],
  connected: true,
  catalogAvailable: true,
  catalogListeners: new Set<() => void>(),
  create: vi.fn<(_input: unknown) => Promise<AtomCommandResult<AgentCreateResult, Error>>>(),
  update: vi.fn<(_input: unknown) => Promise<AtomCommandResult<void, Error>>>(),
  stop: vi.fn<(_input: unknown) => Promise<AtomCommandResult<void, Error>>>(),
  updateThread: vi.fn<(_input: unknown) => Promise<AtomCommandResult<void, Error>>>(),
  unarchive: vi.fn<(_input: unknown) => Promise<AtomCommandResult<void, Error>>>(),
  updateSettings: vi.fn<(_input: unknown) => Promise<AtomCommandResult<void, Error>>>(),
}));
vi.mock("../../state/entities", () => ({
  useProject: (ref: { environmentId: string; projectId: string } | null) =>
    state.projects.find(
      (project) => project.environmentId === ref?.environmentId && project.id === ref.projectId,
    ) ?? null,
  useThreadShells: () => state.threads,
  useAllEnvironmentShellsBootstrapped: () => true,
}));
vi.mock("../../state/environments", () => ({
  usePrimaryEnvironmentId: () => environmentId,
  useEnvironments: () => {
    useSyncExternalStore(
      (listener) => {
        state.catalogListeners.add(listener);
        return () => state.catalogListeners.delete(listener);
      },
      () => state.catalogAvailable,
    );
    return {
      environments: [
        {
          environmentId,
          connection: { phase: state.connected ? "connected" : "disconnected" },
          serverConfig: { settings: DEFAULT_SERVER_SETTINGS, providers: [] },
        },
      ],
    };
  },
}));
vi.mock("../../hooks/useSettings", () => ({
  useClientSettings: () => ({}),
  mergeEnvironmentSettings: () => DEFAULT_SERVER_SETTINGS,
}));
vi.mock("../../providerInstances", () => ({
  deriveProviderInstanceEntries: () =>
    state.catalogAvailable
      ? [
          {
            instanceId: model.instanceId,
            driverKind: "claudeAgent",
            enabled: true,
            isAvailable: true,
          },
        ]
      : [],
  resolveDefaultProviderModelSelection: () => (state.catalogAvailable ? model : null),
}));
vi.mock("../../modelSelection", () => ({
  getCustomModelOptionsByInstance: () =>
    state.catalogAvailable
      ? new Map([
          [
            model.instanceId,
            [
              { slug: model.model, isUnavailable: false },
              { slug: "alternate-model", isUnavailable: false },
            ],
          ],
        ])
      : new Map(),
}));
vi.mock("../../state/projects", () => ({
  projectEnvironment: { createAgent: "create", update: "update" },
}));
vi.mock("../../state/threads", () => ({
  threadEnvironment: {
    stopSession: "stop",
    updateMetadata: "updateThread",
    unarchive: "unarchive",
  },
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { updateSettings: "updateSettings" } }));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: keyof typeof state) => state[command],
}));
vi.mock("../chat/ProviderModelPicker", () => ({
  ProviderModelPicker: (props: {
    model: string;
    onInstanceModelChange: (instanceId: ProviderInstanceId, slug: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => props.onInstanceModelChange(model.instanceId, "alternate-model")}
    >
      {props.model}
    </button>
  ),
}));
vi.mock("../ui/sidebar", () => ({
  SidebarInset: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

import { AgentDialogHost, AgentEditorPage } from "./AgentDialog";
import { closeAgentDialog, openAgentDialog, useAgentDialogStore } from "./agentDialogStore";

const environmentId = EnvironmentId.make("local");
const projectId = ProjectId.make("agent-project");
const threadId = ThreadId.make("durable-agent-chat");
const model = { instanceId: ProviderInstanceId.make("elysia"), model: "native-model" };
const project: Project = {
  id: projectId,
  environmentId,
  title: "Alex",
  workspaceRoot: "/agents/alex",
  repositoryIdentity: null,
  scripts: [],
  defaultModelSelection: model,
  createdAt: "2026-10-01T09:00:00Z",
  updatedAt: "2026-10-01T09:00:00Z",
  agentProfile: {
    instructions: "Research carefully.",
    title: "Researcher",
    avatar: { preset: "brain", color: "violet" },
    notificationsEnabled: true,
    archived: false,
    conversationThreadId: threadId,
  },
};
const thread: SidebarThreadSummary = makeThreadFixture({
  id: threadId,
  environmentId,
  projectId,
  title: "Alex",
  modelSelection: model,
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

function EditorRoute() {
  const search = useSearch({ strict: false });
  const ref =
    search.environmentId && search.projectId
      ? scopeProjectRef(EnvironmentId.make(search.environmentId), ProjectId.make(search.projectId))
      : null;
  return (
    <AgentEditorPage key={ref ? `${ref.environmentId}:${ref.projectId}` : "new"} projectRef={ref} />
  );
}
function makeRouter(initialEntry: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <AgentDialogHost />
        <Outlet />
      </>
    ),
  });
  const prior = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings/general",
    component: () => <p>Settings screen</p>,
  });
  const conversation = createRoute({
    getParentRoute: () => rootRoute,
    path: "/$environmentId/$threadId",
    component: () => <p>Agent conversation</p>,
  });
  const agents = createRoute({
    getParentRoute: () => rootRoute,
    path: "/agents",
    component: EditorRoute,
  });
  const home = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <p>Chats screen</p>,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([prior, conversation, agents, home]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
}

let root: Root;
let host: HTMLDivElement;
let router: ReturnType<typeof makeRouter>;
async function render(initialEntry = "/settings/general?section=appearance") {
  router = makeRouter(initialEntry);
  await act(async () => {
    await router.load();
    root.render(<RouterProvider router={router} />);
  });
}
function button(text: string) {
  return [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === text,
  )!;
}
async function fill(selector: string, value: string) {
  const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  await act(async () => {
    const prototype =
      field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  state.projects = [project];
  state.threads = [thread];
  state.connected = true;
  state.catalogAvailable = true;
  state.create.mockReset().mockResolvedValue(AsyncResult.success({ projectId, threadId }));
  for (const command of [
    state.update,
    state.stop,
    state.updateThread,
    state.unarchive,
    state.updateSettings,
  ])
    command.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  closeAgentDialog();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  closeAgentDialog();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("opens creation as a main-panel page and Cancel returns to the exact prior screen", async () => {
  await render();
  await act(async () => openAgentDialog());
  expect(router.state.location.pathname).toBe("/agents");
  expect(host.querySelectorAll("main")).toHaveLength(1);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => button("Cancel").click());
  expect(router.state.location.href).toBe("/settings/general?section=appearance");
  expect(host.textContent).toContain("Settings screen");
  expect(state.create).not.toHaveBeenCalled();
  expect(useAgentDialogStore.getState().returnHref).toBeNull();
});

it("creates through the native command and opens only the returned durable conversation", async () => {
  await render();
  await act(async () => openAgentDialog());
  expect(host.querySelector("form button")?.getAttribute("aria-label")).toBe("Color #003CB2");
  await fill('input[placeholder="Alex"]', "Sam");
  await fill("textarea", "Help with research.");
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Color #33D7C8"]')!.click(),
  );
  expect(button("Create agent").disabled).toBe(false);
  await submit();
  expect(state.create).toHaveBeenCalledWith({
    environmentId,
    input: {
      name: "Sam",
      defaultModelSelection: model,
      enableAgentBrowserAccess: true,
      agentProfile: {
        instructions: "Help with research.",
        avatar: { preset: "square", color: "#33D7C8" },
        notificationsEnabled: true,
        archived: false,
      },
    },
  });
  expect(router.state.location.pathname).toBe("/local/durable-agent-chat");
  expect(state.update).not.toHaveBeenCalled();
});

it("keeps browser access as a create-time draft until the native creation command saves it", async () => {
  await render();
  await act(async () => openAgentDialog());
  const browserSwitch = [...host.querySelectorAll<HTMLButtonElement>('[role="switch"]')].find(
    (control) => control.closest("label")?.textContent === "Browser access",
  )!;
  expect(browserSwitch.getAttribute("aria-checked")).toBe("true");
  await act(async () => browserSwitch.click());
  expect(browserSwitch.getAttribute("aria-checked")).toBe("false");
  expect(state.updateSettings).not.toHaveBeenCalled();
  await fill('input[placeholder="Alex"]', "Sam");
  await fill("textarea", "Help with research.");
  await submit();
  expect(state.create).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({ enableAgentBrowserAccess: false }),
    }),
  );
  expect(state.updateSettings).not.toHaveBeenCalled();
  expect(router.state.location.pathname).toBe("/local/durable-agent-chat");
});

it("edits an existing profile and returns to its saved conversation, preserving identity and legacy avatar", async () => {
  await render();
  await act(async () => openAgentDialog(scopeProjectRef(environmentId, projectId)));
  expect(router.state.location.search).toEqual({ environmentId, projectId });
  expect(host.querySelector("form button")?.getAttribute("aria-label")).toBe("Color #003CB2");
  await fill('input[placeholder="Research assistant"]', "Analyst");
  await submit();
  expect(state.update).toHaveBeenCalledWith({
    environmentId,
    input: {
      projectId,
      title: "Alex",
      defaultModelSelection: model,
      agentProfile: { ...project.agentProfile, title: "Analyst" },
    },
  });
  expect(router.state.location.pathname).toBe("/local/durable-agent-chat");
  expect(state.create).not.toHaveBeenCalled();
});

it("keeps the editor and field values available after a native save failure", async () => {
  state.update.mockResolvedValue(AsyncResult.failure(Cause.fail(new Error("Offline"))));
  await render();
  await act(async () => openAgentDialog(scopeProjectRef(environmentId, projectId)));
  await submit();
  expect(router.state.location.pathname).toBe("/agents");
  expect(host.querySelector('[role="alert"]')!.textContent).toBe("Offline");
  expect(host.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("Research carefully.");
  state.update.mockResolvedValue(AsyncResult.success(undefined));
  await submit();
  expect(router.state.location.pathname).toBe("/local/durable-agent-chat");
});

it("preserves a newer editor when a previous create response arrives after navigation", async () => {
  let complete!: (result: AtomCommandResult<AgentCreateResult, Error>) => void;
  state.create.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await render();
  await act(async () => openAgentDialog());
  await fill('input[placeholder="Alex"]', "Sam");
  await fill("textarea", "Help with research.");
  await submit();
  expect(state.create).toHaveBeenCalledTimes(1);
  await act(async () => router.navigate({ to: "/settings/general" }));
  await act(async () => openAgentDialog(scopeProjectRef(environmentId, projectId)));
  await fill('input[placeholder="Research assistant"]', "Newer edit");
  await act(async () => complete(AsyncResult.success({ projectId, threadId })));
  expect(router.state.location.pathname).toBe("/agents");
  expect(router.state.location.search).toEqual({ environmentId, projectId });
  expect(
    host.querySelector<HTMLInputElement>('input[placeholder="Research assistant"]')!.value,
  ).toBe("Newer edit");
  expect(useAgentDialogStore.getState().returnHref).toBe("/settings/general");
  expect(state.update).not.toHaveBeenCalled();
});

it("settles the original save when the same agent editor is reopened without navigating", async () => {
  let complete!: (result: AtomCommandResult<void, Error>) => void;
  state.update.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await render();
  await act(async () => openAgentDialog(scopeProjectRef(environmentId, projectId)));
  await submit();
  expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  await act(async () => openAgentDialog(scopeProjectRef(environmentId, projectId)));
  await act(async () => complete(AsyncResult.success(undefined)));
  expect(router.state.location.pathname).toBe("/agents");
  expect(button("Save agent").disabled).toBe(false);
  expect(state.update).toHaveBeenCalledTimes(1);
});

it("blocks save while native work is active", async () => {
  state.threads = [
    {
      ...thread,
      runtime: {
        status: "waiting",
        activeRunId: null,
        providerInstanceId: model.instanceId,
        providerName: "claudeAgent",
        lastError: null,
        updatedAt: thread.updatedAt,
      },
    },
  ];
  await render();
  await act(async () => openAgentDialog(scopeProjectRef(environmentId, projectId)));
  expect(button("Save agent").disabled).toBe(true);
  await submit();
  expect(state.update).not.toHaveBeenCalled();
});

it("does not convert an ordinary project into an agent through a direct editor URL", async () => {
  const { agentProfile: _profile, ...ordinary } = project;
  state.projects = [ordinary];
  await render("/agents?environmentId=local&projectId=agent-project");
  expect(host.textContent).toContain("This agent is no longer available.");
  expect(host.querySelector("form")).toBeNull();
});

it("does not open a different environment's agent with the same project ID", async () => {
  state.projects = [{ ...project, environmentId: EnvironmentId.make("other") }];
  await render("/agents?environmentId=local&projectId=agent-project");
  expect(host.textContent).toContain("This agent is no longer available.");
  expect(host.querySelector("form")).toBeNull();
  expect(state.update).not.toHaveBeenCalled();
});

it("recovers the same legacy archived backing chat after saving, without creating a replacement", async () => {
  state.threads = [{ ...thread, archivedAt: "2026-10-01T10:00:00Z" }];
  await render();
  await act(async () => openAgentDialog(scopeProjectRef(environmentId, projectId)));
  await submit();
  expect(state.unarchive).toHaveBeenCalledWith({ environmentId, input: { threadId } });
  expect(router.state.location.pathname).toBe("/local/durable-agent-chat");
  expect(state.create).not.toHaveBeenCalled();
});

it("resolves a model after the native catalog arrives on a cold route and preserves subsequent user choices", async () => {
  state.catalogAvailable = false;
  await render("/agents");
  await fill('input[placeholder="Alex"]', "Sam");
  await fill("textarea", "Help with research.");
  expect(button("Create agent").disabled).toBe(true);
  expect(host.textContent).toContain("Set up the Elysia CLI to choose a model.");
  await act(async () => {
    state.catalogAvailable = true;
    for (const listener of state.catalogListeners) listener();
  });
  expect(button("Create agent").disabled).toBe(false);
  await act(async () => button("native-model").click());
  await act(async () => {
    state.catalogAvailable = false;
    for (const listener of state.catalogListeners) listener();
  });
  await act(async () => {
    state.catalogAvailable = true;
    for (const listener of state.catalogListeners) listener();
  });
  expect(button("alternate-model")).toBeDefined();
  await submit();
  expect(state.create).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({
        defaultModelSelection: { ...model, model: "alternate-model" },
      }),
    }),
  );
});

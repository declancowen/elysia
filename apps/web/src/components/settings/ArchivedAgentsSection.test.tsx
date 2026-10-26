// @vitest-environment jsdom
import { act, render as renderDom } from "../../../test/render";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type AgentProfile,
} from "@elysiatools/contracts";
import type { AtomCommandResult } from "@elysiatools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { Project } from "../../types";

type RestoreInput = {
  environmentId: EnvironmentId;
  input: { projectId: ProjectId; agentProfile: AgentProfile };
};
const state = vi.hoisted(() => ({
  projects: [] as Project[],
  connected: true,
  listeners: new Set<() => void>(),
  restore: vi.fn<(input: RestoreInput) => Promise<AtomCommandResult<void, Error>>>(),
}));
const subscribe = (listener: () => void) => {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
};
vi.mock("../../state/entities", () => ({
  useProjects: () => useSyncExternalStore(subscribe, () => state.projects),
}));
vi.mock("../../state/environments", () => ({
  usePrimaryEnvironmentId: () => EnvironmentId.make("local"),
  usePrimaryEnvironment: () => ({ environmentId: EnvironmentId.make("local") }),
  useEnvironments: () => ({
    environments: ["local", "other"].map((environmentId) => ({
      environmentId,
      connection: { phase: state.connected ? "connected" : "disconnected" },
    })),
  }),
}));
vi.mock("../../state/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../state/session")>()),
  useEnvironmentScope: () => true,
  useEnvironmentsWithScope: () => new Set([EnvironmentId.make("local")]),
}));
vi.mock("../../state/projects", () => ({
  projectEnvironment: { update: Symbol("updateProject") },
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.restore }));
vi.mock("../../hooks/useSettings", () => ({
  usePrimarySettingsAvailable: () => true,
  useCodeWorkspace: () => true,
}));
vi.mock("./SettingsScopeContext", () => ({ useOptionalSettingsScope: () => null }));
vi.mock("./useScopedSettings", () => ({
  useClearProjectOverrides: () => vi.fn(),
  useClearScopedSettings: () => vi.fn(),
}));

import { ArchivedAgentsSection } from "./ArchivedAgentsSection";

const local = EnvironmentId.make("local");
const other = EnvironmentId.make("other");
const profile: AgentProfile = {
  instructions: "Help with research.",
  title: "Researcher",
  avatar: { preset: "brain", color: "violet" },
  archived: true,
  notificationsEnabled: false,
  conversationThreadId: ThreadId.make("persistent-conversation"),
};
function project(
  environmentId: EnvironmentId,
  title: string,
  agentProfile: AgentProfile | undefined = profile,
): Project {
  return {
    environmentId,
    id: ProjectId.make("same-project-id"),
    title,
    agentProfile,
    workspaceRoot: "/agents/stable-workspace",
    repositoryIdentity: null,
    defaultModelSelection: { instanceId: ProviderInstanceId.make("elysia"), model: "native-model" },
    scripts: [],
    createdAt: "2026-10-01T09:00:00Z",
    updatedAt: "2026-10-01T09:00:00Z",
  };
}
function view(environmentIds: ReadonlyArray<EnvironmentId> = [local]) {
  return <ArchivedAgentsSection environmentIds={environmentIds} />;
}
function restoreButton(name = "Alex") {
  return document.body.querySelector<HTMLButtonElement>(`button[aria-label="Restore ${name}"]`);
}
function applyRestore(input: RestoreInput) {
  state.projects = state.projects.map((project) =>
    project.environmentId === input.environmentId && project.id === input.input.projectId
      ? { ...project, agentProfile: input.input.agentProfile }
      : project,
  );
  for (const listener of state.listeners) listener();
}
beforeEach(() => {
  state.projects = [project(local, "Alex"), project(other, "Bob")];
  state.connected = true;
  state.restore.mockReset().mockImplementation(async (input) => {
    applyRestore(input);
    return AsyncResult.success(undefined);
  });
});
afterEach(async () => {
  vi.unstubAllGlobals();
});

it("shows only archived agent profiles in the selected environment scope", async () => {
  state.projects.push(
    {
      ...project(local, "Active", { ...profile, archived: false }),
      id: ProjectId.make("active-agent"),
    },
    {
      ...project(local, "Ordinary", undefined),
      agentProfile: undefined,
      id: ProjectId.make("ordinary"),
    },
  );
  await using screen = await renderDom(view(), { router: false });
  expect(screen.container.textContent).toContain("Archived agents");
  expect(restoreButton("Alex")).not.toBeNull();
  expect(restoreButton("Bob")).toBeNull();
  expect(screen.container.textContent).not.toContain("Active");
  expect(screen.container.textContent).not.toContain("Ordinary");
  await screen.rerender(view([local, other]));
  expect(restoreButton("Bob")).not.toBeNull();
  await screen.rerender(view([]));
  expect(screen.container.textContent).toContain("No archived agents");
});

it("restores the profile once while pending and preserves the conversation, memory workspace and model", async () => {
  const original = state.projects[0]!;
  let complete!: (result: AtomCommandResult<void, Error>) => void;
  state.restore.mockImplementation(
    (input) =>
      new Promise((resolve) => {
        complete = (result) => {
          applyRestore(input);
          resolve(result);
        };
      }),
  );
  await using screen = await renderDom(view(), { router: false });
  await act(async () => {
    restoreButton()!.click();
    restoreButton()!.click();
  });
  expect(state.restore).toHaveBeenCalledOnce();
  expect(restoreButton()!.disabled).toBe(true);
  expect(restoreButton()!.textContent).toContain("Restoring");
  await act(async () => complete(AsyncResult.success(undefined)));
  const restored = state.projects[0]!;
  expect(restored.agentProfile).toEqual({ ...original.agentProfile, archived: false });
  expect(restored.workspaceRoot).toBe(original.workspaceRoot);
  expect(restored.defaultModelSelection).toBe(original.defaultModelSelection);
  expect(restored.agentProfile?.conversationThreadId).toBe(profile.conversationThreadId);
  expect(state.projects[1]!.agentProfile?.archived).toBe(true);
  expect(restoreButton()).toBeNull();
  expect(screen.container.textContent).toContain("No archived agents");
});

it("keeps the agent archived after a failed restore and allows retry", async () => {
  state.restore.mockResolvedValueOnce(AsyncResult.failure(Cause.fail(new Error("Disconnected"))));
  await using screen = await renderDom(view(), { router: false });
  await act(async () => restoreButton()!.click());
  expect(screen.container.querySelector('[role="alert"]')?.textContent).toBe("Disconnected");
  expect(state.projects[0]!.agentProfile?.archived).toBe(true);
  expect(restoreButton()!.disabled).toBe(false);
  await act(async () => restoreButton()!.click());
  expect(state.restore).toHaveBeenCalledTimes(2);
  expect(state.projects[0]!.agentProfile?.archived).toBe(false);
  expect(restoreButton()).toBeNull();
});

it("keeps disconnected agents visible and waits for reconnection before restoring", async () => {
  state.connected = false;
  await using screen = await renderDom(view(), { router: false });
  expect(restoreButton()!.disabled).toBe(true);
  expect(screen.container.textContent).toContain("Reconnect this environment");
  await act(async () => restoreButton()!.click());
  expect(state.restore).not.toHaveBeenCalled();
  state.connected = true;
  await screen.rerender(view());
  await act(async () => restoreButton()!.click());
  expect(state.projects[0]!.agentProfile?.archived).toBe(false);
});

vi.mock("vite-plus/test/browser", () => ({
  page: { elementLocator: () => ({}) },
  utils: { getElementLocatorSelectors: () => ({}) },
}));

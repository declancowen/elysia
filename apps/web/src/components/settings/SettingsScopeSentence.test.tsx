// @vitest-environment jsdom
import {
  DEFAULT_CLIENT_SETTINGS,
  EnvironmentId,
  ProjectId,
  ThreadId,
} from "@elysiatools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { Project } from "../../types";
import { derivePhysicalProjectKey, selectProjectGroupingSettings } from "../../logicalProject";
import type { SettingsScopeSearch } from "./settingsScope";
import { resolveSettingsScope } from "./settingsScope";
import { useSettingsProjectGroups } from "./useSettingsProjectGroups";

const state = vi.hoisted(() => ({
  projects: [] as Project[],
  search: {} as SettingsScopeSearch,
  pathname: "/settings/general",
  navigate: vi.fn(),
  select: vi.fn(),
}));
const environmentId = EnvironmentId.make("agent-settings-local");
const environments = [
  { environmentId, label: "Elysia", connection: { phase: "connected" }, serverConfig: null },
];
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
  useLocation: ({ select }: { select: (location: { pathname: string }) => unknown }) =>
    select({ pathname: state.pathname }),
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => state.projects,
  useThreadShells: () => [],
}));
vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({ environments }),
  usePrimaryEnvironmentId: () => environmentId,
}));
vi.mock("../../hooks/useSettings", () => ({
  useClientSettings: () => selectProjectGroupingSettings(DEFAULT_CLIENT_SETTINGS),
}));
vi.mock("../agents/useAgentActions", () => ({
  useAgentActions: () => ({ pending: false, archive: vi.fn() }),
}));
vi.mock("./SettingsScopeContext", () => ({
  useOptionalSettingsScope: () => {
    const groups = useSettingsProjectGroups();
    return {
      groups,
      search: state.search,
      singleEnvironment: true,
      scope: resolveSettingsScope(state.search, groups, environments),
      selectScope: (search: SettingsScopeSearch) => {
        state.search = search;
        state.select(search);
      },
    };
  },
}));
import { SettingsScopeSentence } from "./SettingsScopeSentence";

const agent: Project = {
  environmentId,
  id: ProjectId.make("agent-settings-alex"),
  title: "Alex",
  workspaceRoot: "/agents/alex",
  repositoryIdentity: null,
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-10-03T00:00:00Z",
  updatedAt: "2026-10-03T00:00:00Z",
  agentProfile: {
    instructions: "Help finish the work.",
    title: "Assistant",
    avatar: { preset: "brain", color: "blue" },
    archived: false,
    notificationsEnabled: true,
    conversationThreadId: ThreadId.make("alex-settings-chat"),
  },
};
let host: HTMLDivElement;
let root: Root;
const render = () =>
  act(async () => root.render(<SettingsScopeSentence key={JSON.stringify(state.search)} />));
const named = (role: string, name: string) =>
  [
    ...document.querySelectorAll<HTMLElement>(
      `[role="${role}"],${role === "button" ? "button" : "[hidden]"}`,
    ),
  ].find(
    (element) =>
      element.getAttribute("aria-label") === name || element.textContent?.trim() === name,
  )!;
const click = (element: HTMLElement) => act(async () => element.click());
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  state.projects = [
    agent,
    {
      ...agent,
      id: ProjectId.make("normal-project"),
      title: "Project",
      workspaceRoot: "/project",
      agentProfile: undefined,
    },
    {
      ...agent,
      id: ProjectId.make("archived-agent"),
      title: "Archived agent",
      agentProfile: { ...agent.agentProfile!, archived: true },
    },
  ];
  state.search = { machine: environmentId };
  state.pathname = "/settings/general";
  state.navigate.mockClear();
  state.select.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("offers an agent avatar and name, selects its existing project scope and opens its profile", async () => {
  await render();
  await click(named("button", "Settings scope: App defaults"));
  expect(document.body.textContent).toContain("Agents");
  expect(document.body.textContent).not.toContain("Archived agent");
  const option = named("menuitemradio", "Alex");
  expect(option.querySelector("svg")).not.toBeNull();
  await click(option);
  await render();
  expect(state.select).toHaveBeenCalledWith({
    project: derivePhysicalProjectKey(agent),
    machine: environmentId,
  });
  expect(named("button", "Settings scope: Alex").querySelector("svg")).not.toBeNull();
  expect(document.body.textContent).toContain(agent.agentProfile!.instructions);
  await click(named("button", "Scheduled"));
  expect(state.navigate).toHaveBeenCalledWith({
    to: "/settings/scheduled-tasks",
    search: {
      project: derivePhysicalProjectKey(agent),
      machine: environmentId,
      checkout: undefined,
    },
  });
  expect(document.querySelector('[data-slot="popover-popup"]')).toBeNull();
  await click(named("button", "Settings scope: Alex"));
  await click(named("menuitemradio", "App defaults"));
  await render();
  expect(named("button", "Settings scope: App defaults")).toBeDefined();
  expect(document.querySelector('[data-slot="popover-popup"]')).toBeNull();
});

it("keeps an agent's scheduled tasks visible on direct scoped navigation without reopening its profile", async () => {
  state.search = { project: derivePhysicalProjectKey(agent), machine: environmentId };
  state.pathname = "/settings/scheduled-tasks";
  await render();
  expect(named("button", "Settings scope: Alex")).toBeDefined();
  expect(document.querySelector('[data-slot="popover-popup"]')).toBeNull();
  await click(named("button", "Manage Alex"));
  expect(document.body.textContent).toContain(agent.agentProfile!.instructions);
});

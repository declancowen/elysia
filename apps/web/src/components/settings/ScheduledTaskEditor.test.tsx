// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  DEFAULT_CLIENT_SETTINGS,
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type ModelSelection,
  type ServerProvider,
} from "@elysiatools/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { Project } from "../../types";

const state = vi.hoisted(() => ({
  projects: [] as Project[],
  providers: [] as ServerProvider[],
  threads: new Map<
    string,
    {
      id: ThreadId;
      modelSelection: ModelSelection;
      runtimeMode: "full-access";
      interactionMode: "default";
    }
  >(),
  save: vi.fn(),
  close: vi.fn(),
  toast: vi.fn(),
}));
const environmentId = EnvironmentId.make("scheduled-editor-local");
const instanceId = ProviderInstanceId.make("claudeAgent");
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: string) =>
    atom === "providers"
      ? state.providers
      : atom === "permission"
        ? true
        : atom === "keybindings"
          ? []
          : null,
}));
vi.mock("../../state/server", () => ({
  EMPTY_SERVER_PROVIDERS: [],
  primaryServerKeybindingsAtom: "keybindings",
  serverEnvironment: {
    scheduledTasksLive: () => "tasks",
    providersValueAtom: () => "providers",
    upsertScheduledTask: { permissionAtom: () => "permission" },
  },
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: () => ({ data: { tasks: [] }, error: null }),
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.save }));
vi.mock("../../state/session", () => ({ readEnvironmentScope: () => true }));
vi.mock("../../state/entities", () => ({
  useProjects: () => state.projects,
  useThreadShell: (ref: { threadId: ThreadId } | null) =>
    ref ? (state.threads.get(ref.threadId) ?? null) : null,
}));
vi.mock("../../state/environments", () => ({
  useEnvironment: () => ({ connection: { phase: "connected" }, serverConfig: {} }),
}));
vi.mock("../../state/assets", () => ({ projectFaviconUrlAtom: () => "favicon" }));
vi.mock("../../hooks/useSettings", () => ({
  useCodeWorkspace: () => false,
  useEnvironmentSettings: () => DEFAULT_SERVER_SETTINGS,
  useClientSettings: (select: (settings: typeof DEFAULT_CLIENT_SETTINGS) => unknown) =>
    select(DEFAULT_CLIENT_SETTINGS),
  useUpdateClientSettings: () => vi.fn(),
}));
vi.mock("./SettingsScopeContext", () => ({
  useSettingsScope: () => ({
    scope: { kind: "all", members: [], environmentIds: [environmentId] },
    connectedEnvironments: [],
  }),
}));
// Prompt mention interactions have their own suite; this exercises destination and model saves.
vi.mock("./ScheduledTaskPrompt", () => ({
  ScheduledTaskPrompt: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Scheduled task prompt"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
vi.mock("../ui/toast", () => ({
  toastManager: { add: state.toast },
  stackedThreadToast: (value: unknown) => value,
}));
// jsdom has no layout viewport; keep the real model picker and render its virtual rows.
vi.mock("@legendapp/list/react", () => ({
  LegendList: ({
    data,
    renderItem,
  }: {
    data: string[];
    renderItem: (entry: { item: string; index: number }) => ReactNode;
  }) => (
    <div>
      {data.map((item, index) => (
        <div key={item}>{renderItem({ item, index })}</div>
      ))}
    </div>
  ),
}));

import { ScheduledTaskEditor } from "./ScheduledTaskEditor";

const agent: Project = {
  environmentId,
  id: ProjectId.make("scheduled-alex"),
  title: "Alex",
  workspaceRoot: "/agents/alex",
  repositoryIdentity: null,
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-10-08T00:00:00Z",
  updatedAt: "2026-10-08T00:00:00Z",
  agentProfile: {
    instructions: "Help finish the work.",
    title: "Assistant",
    avatar: { preset: "brain", color: "blue" },
    archived: false,
    notificationsEnabled: true,
    conversationThreadId: ThreadId.make("alex-dedicated"),
  },
};
const channel: Project = {
  ...agent,
  id: ProjectId.make("scheduled-team"),
  title: "Team",
  agentProfile: {
    ...agent.agentProfile!,
    conversationThreadId: ThreadId.make("team-dedicated"),
    group: {
      memberProjectIds: [agent.id, ProjectId.make("foreign-member")],
      leadProjectId: agent.id,
    },
  },
};
const project: Project = {
  ...agent,
  id: ProjectId.make("scheduled-project"),
  title: "Website",
  workspaceRoot: "/website",
  agentProfile: undefined,
};
let root: Root;
let host: HTMLDivElement;
const click = (element: HTMLElement) => act(async () => element.click());
function button(name: string) {
  const element = [...document.querySelectorAll<HTMLElement>("button")].find(
    (candidate) =>
      candidate.getAttribute("aria-label") === name || candidate.textContent?.trim() === name,
  );
  expect(element, `Button ${name}`).toBeDefined();
  return element!;
}
function destination() {
  const label = [...host.querySelectorAll("label")].find((entry) =>
    entry.textContent?.startsWith("Project, agent or channel"),
  )!;
  return document.getElementById(label.htmlFor)!;
}
async function selectDestination(name: string) {
  await click(destination());
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  expect(option, `Destination ${name}`).toBeDefined();
  await click(option!);
}
async function selectModel(name: string) {
  await click(button("Scheduled task model"));
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((entry) =>
    entry.textContent?.includes(name),
  );
  expect(option, `Model ${name}`).toBeDefined();
  await click(option!);
  expect(button("Scheduled task model").textContent).toContain(name);
}
async function fillDetails() {
  await act(async () => {
    const title = host.querySelector<HTMLInputElement>(
      'input[placeholder="e.g. Check for Sentry issues"]',
    )!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      title,
      "Daily review",
    );
    title.dispatchEvent(new Event("input", { bubbles: true }));
    const prompt = host.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      prompt,
      "Review the latest changes.",
    );
    prompt.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(async () => {
  vi.clearAllMocks();
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
    project,
    agent,
    channel,
    {
      ...agent,
      id: ProjectId.make("archived-agent"),
      title: "Archived agent",
      agentProfile: { ...agent.agentProfile!, archived: true },
    },
    {
      ...channel,
      id: ProjectId.make("archived-channel"),
      title: "Archived channel",
      agentProfile: { ...channel.agentProfile!, archived: true },
    },
    {
      ...agent,
      environmentId: EnvironmentId.make("other-environment"),
      id: ProjectId.make("foreign-member"),
      title: "Foreign agent",
    },
  ];
  state.providers = [
    {
      instanceId,
      driver: ProviderDriverKind.make("claudeAgent"),
      enabled: true,
      installed: true,
      version: "0.3.9",
      status: "ready",
      auth: { status: "authenticated" },
      checkedAt: "2026-10-08T00:00:00Z",
      models: [
        {
          slug: "model-fast",
          name: "Fast model",
          isDefault: true,
          isCustom: false,
          capabilities: {},
        },
        { slug: "model-careful", name: "Careful model", isCustom: false, capabilities: {} },
      ],
      skills: [],
      slashCommands: [],
    },
  ];
  state.threads = new Map(
    [agent, channel].map((entry) => [
      entry.agentProfile!.conversationThreadId!,
      {
        id: entry.agentProfile!.conversationThreadId!,
        modelSelection: { instanceId, model: "model-fast" },
        runtimeMode: "full-access",
        interactionMode: "default",
      },
    ]),
  );
  state.save.mockResolvedValue({ _tag: "Success", value: {} });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <ScheduledTaskEditor
        initialEnvironmentId={environmentId}
        task={null}
        onClose={state.close}
        inline
      />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("groups destinations with icons and excludes archived and other-environment spaces", async () => {
  expect(destination().querySelector("svg")).not.toBeNull();
  await click(destination());
  expect(
    [...document.querySelectorAll('[data-slot="select-group-label"]')].map(
      (entry) => entry.textContent,
    ),
  ).toEqual(["Agents", "Channels", "Projects"]);
  const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
  expect(options.map((entry) => entry.textContent?.trim())).toEqual(["Alex", "Team", "Website"]);
  for (const option of options) expect(option.querySelector("svg")).not.toBeNull();
  const team = options.find((entry) => entry.textContent?.trim() === "Team")!;
  expect(team.querySelectorAll(".agent-avatar")).toHaveLength(1);
  await click(team);
  expect(destination().textContent).toContain("Team");
  expect(destination().querySelectorAll(".agent-avatar")).toHaveLength(1);
});

it("lets an agent task change model and saves the choice in its dedicated thread", async () => {
  await selectDestination("Alex");
  expect(destination().querySelector(".agent-avatar")).not.toBeNull();
  await selectModel("Careful model");
  await fillDetails();
  await click(button("Create task"));
  expect(state.save).toHaveBeenCalledWith({
    environmentId,
    input: expect.objectContaining({
      projectId: agent.id,
      threadId: agent.agentProfile!.conversationThreadId,
      modelSelection: { instanceId, model: "model-careful" },
    }),
  });
  expect(state.close).toHaveBeenCalledOnce();
  expect(state.toast).not.toHaveBeenCalled();
});

it("follows the newly selected agent's model before accepting an explicit override", async () => {
  await selectModel("Careful model");
  await selectDestination("Alex");
  expect(button("Scheduled task model").textContent).toContain("Fast model");
  await fillDetails();
  await click(button("Create task"));
  expect(state.save).toHaveBeenCalledWith({
    environmentId,
    input: expect.objectContaining({
      projectId: agent.id,
      threadId: agent.agentProfile!.conversationThreadId,
      modelSelection: { instanceId, model: "model-fast" },
    }),
  });
});

it("refuses an agent destination whose dedicated chat is unavailable", async () => {
  state.threads.delete(agent.agentProfile!.conversationThreadId!);
  await selectDestination("Alex");
  await fillDetails();
  await click(button("Create task"));
  expect(state.save).not.toHaveBeenCalled();
  expect(state.close).not.toHaveBeenCalled();
  expect(state.toast).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Agent chat is unavailable" }),
  );
});

it("routes a channel task to its dedicated thread and keeps member models", async () => {
  await selectDestination("Team");
  expect(host.textContent).toContain("Channel members use their own selected models.");
  expect(host.querySelector('[aria-label="Scheduled task model"]')).toBeNull();
  await fillDetails();
  await click(button("Create task"));
  expect(state.save).toHaveBeenCalledWith({
    environmentId,
    input: expect.objectContaining({
      projectId: channel.id,
      threadId: channel.agentProfile!.conversationThreadId,
    }),
  });
  expect(state.close).toHaveBeenCalledOnce();
});

it("saves project tasks without a dedicated thread so each run starts its own thread", async () => {
  await fillDetails();
  await click(button("Create task"));
  expect(state.save).toHaveBeenCalledWith({
    environmentId,
    input: expect.objectContaining({
      projectId: project.id,
      threadId: null,
      workspaceStrategy: { type: "root" },
    }),
  });
  expect(state.close).toHaveBeenCalledOnce();
});

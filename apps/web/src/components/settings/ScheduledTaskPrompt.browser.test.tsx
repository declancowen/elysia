import { act, useState } from "react";
import { userEvent } from "vite-plus/test/browser";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, ThreadId } from "@elysiatools/contracts";
import type { EnvironmentProject } from "@elysiatools/client-runtime/state/shell";
import { mentionedAgentProjectIds } from "@elysiatools/shared/agentMentions";

const state = vi.hoisted(() => ({ projects: [] as EnvironmentProject[], changed: vi.fn() }));
vi.mock(import("../../hooks/useTheme"), async (original) => ({
  ...(await original()),
  useTheme: (() => ({ resolvedTheme: "dark" })) as never,
  useRenderedAppearance: () => "dark",
}));
vi.mock(import("../../state/entities"), async (original) => ({
  ...(await original()),
  useProject: (ref: { projectId: string } | null) =>
    state.projects.find((project) => project.id === ref?.projectId) ?? null,
}));
import { ScheduledTaskPrompt } from "./ScheduledTaskPrompt";

const environmentId = EnvironmentId.make("local");
const agent: EnvironmentProject = {
  environmentId,
  id: ProjectId.make("friday"),
  title: "Friday",
  workspaceRoot: "/agents/friday",
  repositoryIdentity: null,
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-10-08T00:00:00Z",
  updatedAt: "2026-10-08T00:00:00Z",
  agentProfile: {
    instructions: "Help",
    avatar: { preset: "brain", color: "#28B4FF" },
    archived: false,
    notificationsEnabled: true,
    conversationThreadId: ThreadId.make("friday-chat"),
  },
};
const channel: EnvironmentProject = {
  ...agent,
  id: ProjectId.make("launch-team"),
  title: "Launch team",
  agentProfile: {
    ...agent.agentProfile!,
    conversationThreadId: ThreadId.make("channel-chat"),
    group: { memberProjectIds: [agent.id], leadProjectId: agent.id },
  },
};
let host: HTMLDivElement;
let root: Root;
function Form({ project = agent }: { project?: EnvironmentProject }) {
  const [value, setValue] = useState("");
  return (
    <ScheduledTaskPrompt
      environmentId={environmentId}
      project={project}
      projects={state.projects}
      value={value}
      disabled={false}
      onChange={(next) => {
        state.changed(next);
        setValue(next);
      }}
    />
  );
}
const editor = () => host.querySelector<HTMLElement>('[role="textbox"]')!;
async function typeAtEnd(text: string) {
  await act(async () => editor().focus());
  await act(async () => userEvent.keyboard(text));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.changed.mockClear();
  state.projects = [
    agent,
    channel,
    {
      ...agent,
      id: ProjectId.make("archived"),
      title: "Archived",
      agentProfile: { ...agent.agentProfile!, archived: true },
    },
    {
      ...agent,
      id: ProjectId.make("remote"),
      title: "Remote",
      environmentId: EnvironmentId.make("other"),
    },
  ];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("inserts an agent suggestion as a readable avatar tag with its durable identity", async () => {
  await act(async () => root.render(<Form />));
  expect(host.querySelector("button")).toBeNull();
  await typeAtEnd("@Friday");
  await vi.waitFor(() =>
    expect(host.querySelector('[data-composer-item-id="friday"]')).not.toBeNull(),
  );
  const option = host.querySelector<HTMLElement>('[data-composer-item-id="friday"]')!;
  expect(option.querySelector("svg")).not.toBeNull();
  await act(async () => option.click());
  expect(mentionedAgentProjectIds(state.changed.mock.lastCall![0])).toEqual([agent.id]);
  expect(editor().textContent).toContain("Friday");
  expect(editor().textContent).not.toContain("context://");
  expect(editor().querySelector('path[fill="#28B4FF"]')).not.toBeNull();
  expect(editor().querySelector(".font-semibold")?.textContent).toBe("Friday");
});

it("filters typed @ suggestions and replaces the token with a keyboard-selected channel tag", async () => {
  await act(async () => root.render(<Form />));
  await typeAtEnd("Review @Launch");
  expect(host.querySelector('[role="listbox"]')?.textContent).toContain("Launch team");
  expect(host.querySelector('[role="listbox"]')?.textContent).not.toContain("Friday");
  await act(async () =>
    editor().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    ),
  );
  expect(mentionedAgentProjectIds(state.changed.mock.lastCall![0])).toEqual([channel.id]);
  expect(editor().textContent).toContain("Review Launch team");
  expect(host.querySelector('[role="listbox"]')).toBeNull();
});

it("limits a channel prompt to its active members and lets Escape dismiss suggestions", async () => {
  await act(async () => root.render(<Form project={channel} />));
  expect(host.querySelector("button")).toBeNull();
  await typeAtEnd("@");
  expect(host.querySelector('[role="listbox"]')?.textContent).toContain("Friday");
  expect(host.querySelector('[role="listbox"]')?.textContent).not.toContain("Launch team");
  await act(async () =>
    editor().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    ),
  );
  expect(host.querySelector('[role="listbox"]')).toBeNull();
  expect(state.changed.mock.lastCall![0]).toBe("@");
});

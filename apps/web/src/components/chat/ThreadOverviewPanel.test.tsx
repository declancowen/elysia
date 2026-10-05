// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { EventId, MessageId, ProjectId, ThreadId, TurnId } from "@t3tools/contracts";
import type { DelegatedAgentView } from "../agents/useDelegatedAgents";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";

const state = vi.hoisted(() => ({
  wide: false,
  code: true,
  delegated: [] as DelegatedAgentView[],
  roster: [] as { project: NonNullable<DelegatedAgentView["project"]> }[],
}));
vi.mock("~/hooks/useMediaQuery", () => ({ useMediaQuery: () => state.wide }));
vi.mock("~/hooks/useSettings", () => ({ useCodeWorkspace: () => state.code }));
vi.mock("../agents/useDelegatedAgents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../agents/useDelegatedAgents")>()),
  useDelegatedAgents: () => state.delegated,
}));
vi.mock("../agents/useAgents", () => ({ useAgents: () => state.roster }));
vi.mock("../ChatMarkdown", () => ({ default: ({ text }: { text: string }) => <p>{text}</p> }));

import { ThreadOverviewPanel, type ThreadOverviewPanelProps } from "./ThreadOverviewPanel";
import { openThreadOverviewAgent, useThreadOverviewStore } from "./threadOverviewStore";
import { EnvironmentId } from "@t3tools/contracts";
import type { ChatAttachment } from "~/types";

let root: Root;
let host: HTMLDivElement;
function createTestRouter() {
  const rootRoute = createRootRoute();
  const threadRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/$environmentId/$threadId",
  });
  return createRouter({
    routeTree: rootRoute.addChildren([threadRoute]),
    history: createMemoryHistory({ initialEntries: ["/local/source"] }),
  });
}
let router: ReturnType<typeof createTestRouter>;
const props: ThreadOverviewPanelProps = {
  threadKey: "thread-one",
  label: "Elysia",
  changes: { additions: 35, deletions: 8 },
  agents: { working: 1, done: 2 },
  sources: ["recent.pdf", "photo.png", "notes.md", "older.txt"].map((name, index) => ({
    id: `source-${index}` as ChatAttachment["id"],
    name,
    type: "file",
    mimeType: "text/plain",
    sizeBytes: 1,
  })),
  onToggleChanges: vi.fn(),
  onOpenSources: vi.fn(),
  onAddSources: () => {},
  onOpenSource: () => {},
};

async function render(overrides: Partial<ThreadOverviewPanelProps> = {}) {
  await act(async () =>
    root.render(
      <RouterContextProvider router={router}>
        <ThreadOverviewPanel {...props} {...overrides} />
      </RouterContextProvider>,
    ),
  );
}

async function click(label: string) {
  const button = Array.from(document.querySelectorAll("button")).find(
    (element) =>
      element.getAttribute("aria-label") === label || element.textContent?.trim() === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}

async function outsidePress() {
  await act(async () => {
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(async () => {
  router = createTestRouter();
  await router.load();
  state.wide = false;
  state.code = true;
  state.delegated = [];
  state.roster = [];
  useThreadOverviewStore.setState({ target: null });
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("shows only three uploads, collapses with a count, and opens all sources", async () => {
  await render();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click("Thread overview");
  expect(document.body.textContent).toContain("recent.pdf");
  expect(document.body.textContent).not.toContain("older.txt");
  await click("Collapse sources");
  expect(document.body.textContent).toContain("Sources · 4");
  expect(document.body.textContent).not.toContain("recent.pdf");
  expect(document.body.textContent).not.toContain("View all");
  await click("Expand sources");
  expect(document.body.textContent).toContain("recent.pdf");
  expect(document.body.textContent).not.toContain("older.txt");
  await click("View all");
  expect(props.onOpenSources).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("keeps the wide overview open during chat interaction and resets it when the screen narrows", async () => {
  state.wide = true;
  await render();
  await click("Thread overview");
  await outsidePress();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await click("View all");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click("Thread overview");
  state.wide = false;
  await render();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("uses a dismissible overlay when another sidebar occupies the wide screen", async () => {
  state.wide = true;
  await render({ transient: true });
  await click("Thread overview");
  await outsidePress();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("closes on Escape and navigation, and keeps sources and agents visible in Work mode", async () => {
  state.code = false;
  await render();
  await click("Thread overview");
  expect(document.body.textContent).not.toContain("Changes");
  expect(document.body.textContent).toContain("1 working");
  expect(document.body.textContent).toContain("recent.pdf");
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click("Thread overview");
  await render({ threadKey: "thread-two" });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("opens the full Sources view and dismisses the narrow overlay", async () => {
  await render();
  await click("Thread overview");
  await click("View all");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("opens subagents inside the same floating overview", async () => {
  await render();
  await click("Thread overview");
  expect(props.onToggleChanges).not.toHaveBeenCalled();
  expect(props.onOpenSources).not.toHaveBeenCalled();
  await click("1 working2 done");
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.body.textContent).toContain("No subagents yet.");
  await click("Back to thread overview");
  expect(document.body.textContent).toContain("recent.pdf");
});

function workingAgent(name: string): DelegatedAgentView {
  const job = {
    activityId: EventId.make(`activity-${name}`),
    agentProjectId: ProjectId.make(name),
    agentThreadId: ThreadId.make(`thread-${name}`),
    agentName: name,
    sourceMessageId: MessageId.make("source-request"),
    targetMessageId: MessageId.make(`target-${name}`),
    targetTurnId: TurnId.make(`turn-${name}`),
  };
  return {
    job,
    project: undefined,
    name,
    working: true,
    data: { ...job, status: "working", messages: [], truncated: false },
  };
}

it("keeps one agent entry, uses its own summary, and expands halfway across and down the wide thread", async () => {
  state.wide = true;
  const first = workingAgent("Friday");
  const second = {
    ...first,
    job: {
      ...first.job,
      activityId: EventId.make("second"),
      sourceMessageId: MessageId.make("second-request"),
    },
  };
  const response = (text: string) => [
    {
      id: MessageId.make(text),
      role: "assistant" as const,
      text,
      turnId: TurnId.make("turn-Friday"),
      streaming: false,
      createdAt: "2026-10-02T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:01.000Z",
    },
  ];
  state.delegated = [
    {
      ...first,
      working: false,
      data: {
        ...first.data!,
        status: "completed",
        messages: [
          ...response("**Task:** I will check the first request."),
          ...response("First result"),
        ],
      },
    },
    {
      ...second,
      data: {
        ...second.data!,
        messages: [
          ...response("**Task:** I will check the second request."),
          ...response("Second result"),
        ],
      },
    },
  ];
  host.setAttribute("data-chat-header", "");
  vi.spyOn(host, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1000, 50));
  const composerElement = document.createElement("div");
  vi.spyOn(composerElement, "getBoundingClientRect").mockReturnValue({
    top: 500,
    bottom: 600,
  } as DOMRect);
  await render({
    composerElement,
    delegatedAgents: state.delegated.map(({ job }) => job),
  });
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.body.textContent).toContain("I will check the first request.");
  expect(document.body.textContent).not.toContain("First ask");
  expect(document.body.textContent).toContain("First result");
  expect(document.body.textContent).toContain("I will check the second request.");
  expect(document.body.textContent).not.toContain("Second ask");
  expect(document.body.textContent).toContain("Second result");
  expect(document.body.textContent).not.toContain("recent.pdf");
  expect(document.querySelector('input, textarea, [contenteditable="true"]')).toBeNull();
  expect((document.querySelector('[role="dialog"]') as HTMLElement).style.height).toBe("320px");
  await click("Expand agent responses");
  expect((document.querySelector('[role="dialog"]') as HTMLElement).style.height).toBe("448px");
  expect((document.querySelector('[role="dialog"]') as HTMLElement).style.width).toBe("648px");
  await click("Collapse agent responses");
  expect((document.querySelector('[role="dialog"]') as HTMLElement).style.height).toBe("320px");
  await click("Back to thread overview");
  expect(document.querySelectorAll('[aria-label="View Friday responses"]')).toHaveLength(1);
  await click("View Friday responses");
  expect(document.body.textContent).toContain("Second result");
});

it("keeps completed history closed after the source detail loads", async () => {
  await render({ sourceHistoryReady: false });
  const agent = workingAgent("Friday");
  state.delegated = [{ ...agent, working: false, data: { ...agent.data!, status: "completed" } }];
  await render({
    sourceHistoryReady: true,
    delegatedAgents: state.delegated.map(({ job }) => job),
  });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click("Thread overview");
  expect(document.querySelector('[aria-label="View Friday responses"]')).not.toBeNull();
});

it("opens an individual subagent result inside the container and returns through Back", async () => {
  await render({
    subagents: [
      {
        id: "research",
        title: "Research the release",
        status: "completed",
        result: "Release verified",
        error: null,
        progress: null,
      },
    ],
  });
  await click("Thread overview");
  await click("1 working2 done");
  await click("Research the releasecompleted");
  expect(document.body.textContent).toContain("Release verified");
  expect(document.body.textContent).not.toContain("recent.pdf");
  await click("Back to subagents");
  expect(document.body.textContent).toContain("Research the release");
  expect(document.body.textContent).not.toContain("Release verified");
  await click("Back to thread overview");
  expect(document.body.textContent).toContain("recent.pdf");
});

it("uses the overview arrow for Git changes, and expands narrow agent responses without changing height", async () => {
  await render();
  await click("Thread overview");
  const panel = document.querySelector('[role="dialog"]') as HTMLElement;
  expect(panel.style.width).toBe("320px");
  await click("Hide Git");
  expect(document.body.textContent).not.toContain("Changes");
  expect(props.onToggleChanges).not.toHaveBeenCalled();
  await click("Show Git");
  await click("Changes+35−8");
  expect(props.onToggleChanges).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  state.code = false;
  state.delegated = [workingAgent("Friday")];
  await render({ delegatedAgents: state.delegated.map(({ job }) => job) });
  const responses = document.querySelector('[role="dialog"]') as HTMLElement;
  expect(document.body.textContent).toContain("Working");
  expect(document.querySelector('[aria-label="Show Git"]')).toBeNull();
  const height = responses.style.height;
  await click("Expand agent responses");
  expect(responses.style.width).toBe(`${window.innerWidth - 24}px`);
  expect(responses.style.height).toBe(height);
});

it("opens the clicked agent's responses only in the originating chat", async () => {
  const agent = workingAgent("Friday");
  state.delegated = [{ ...agent, working: false, data: { ...agent.data!, status: "completed" } }];
  const source = { environmentId: EnvironmentId.make("local"), threadId: ThreadId.make("source") };
  await render({ sourceThreadRef: source, delegatedAgents: state.delegated.map(({ job }) => job) });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () =>
    openThreadOverviewAgent(
      { ...source, threadId: ThreadId.make("other") },
      agent.job.agentProjectId,
    ),
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => openThreadOverviewAgent(source, agent.job.agentProjectId));
  expect(document.body.textContent).toContain("No task summary was recorded");
  expect(document.querySelector('[aria-label="View Friday responses"]')).toBeNull();
  expect(document.body.textContent).not.toContain("recent.pdf");
  expect(useThreadOverviewStore.getState().target).toBeNull();
});

it.each([false, true])(
  "fits the thread column after panel resizing and hides pointless expansion (wide: %s)",
  async (wide) => {
    const observers = new Map<Element, Set<() => void>>();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private callback: () => void) {}
        observe(element: Element) {
          const callbacks = observers.get(element) ?? new Set();
          callbacks.add(this.callback);
          observers.set(element, callbacks);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    state.wide = wide;
    state.delegated = [workingAgent("Friday")];
    host.setAttribute("data-chat-column-maximized-away", "false");
    let bounds = new DOMRect(200, 0, 780, 200);
    vi.spyOn(host, "getBoundingClientRect").mockImplementation(() => bounds);
    await render({ delegatedAgents: state.delegated.map(({ job }) => job) });
    await click("Expand agent responses");
    const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(panel.style.width).toBe(wide ? "538px" : "756px");
    expect(panel.style.height).toBe("176px");

    // Opening/resizing the side panel changes the column without resizing the window.
    bounds = new DOMRect(200, 0, 300, 160);
    await act(async () => {
      for (const callback of observers.get(host) ?? []) callback();
    });
    expect(panel.style.width).toBe("276px");
    expect(panel.style.height).toBe("136px");
    await click("Collapse agent responses");
    expect(panel.style.width).toBe("276px");
    expect(document.querySelector('[aria-label="Expand agent responses"]')).toBeNull();

    vi.stubGlobal("innerHeight", 140);
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(panel.style.height).toBe("116px");
  },
);

it.each([false, true])(
  "shows one task identity and one response identity across progress and final messages (group=%s)",
  async (group) => {
    const agent = workingAgent("Friday");
    state.delegated = [
      {
        ...agent,
        project: {
          environmentId: EnvironmentId.make("local"),
          id: agent.job.agentProjectId,
          title: "Friday",
          workspaceRoot: "/agents/friday",
          repositoryIdentity: null,
          defaultModelSelection: null,
          scripts: [],
          createdAt: "2026-10-02T00:00:00Z",
          updatedAt: "2026-10-02T00:00:00Z",
          agentProfile: {
            instructions: "Assist with tasks.",
            avatar: { preset: "brain", color: "#28B4FF" },
            ...(group
              ? {
                  group: {
                    memberProjectIds: [ProjectId.make("lead"), ProjectId.make("member")],
                    leadProjectId: ProjectId.make("lead"),
                  },
                }
              : {}),
            archived: false,
            notificationsEnabled: true,
          },
        },
        data: {
          ...agent.data!,
          ...(group ? { respondingAgentProjectId: ProjectId.make("member") } : {}),
          messages: ["**Task:** Check it.", "First progress", "Next progress", "Final result"].map(
            (text) => ({
              id: MessageId.make(text),
              role: "assistant" as const,
              text,
              turnId: agent.job.targetTurnId,
              streaming: false,
              createdAt: "2026-10-02T00:00:00Z",
              updatedAt: "2026-10-02T00:00:00Z",
            }),
          ),
        },
      },
    ];
    if (group)
      state.roster = [
        {
          project: {
            ...state.delegated[0]!.project!,
            id: ProjectId.make("member"),
            agentProfile: {
              ...state.delegated[0]!.project!.agentProfile!,
              group: undefined,
              avatar: { preset: "circle", color: "blue" },
            },
          },
        },
      ];
    await render({
      sourceThreadRef: {
        environmentId: EnvironmentId.make("local"),
        threadId: ThreadId.make("source"),
      },
      delegatedAgents: [agent.job],
    });
    const body = document.querySelector<HTMLElement>("[data-agent-panel-scroll]")!;
    expect(body.querySelectorAll(".agent-avatar")).toHaveLength(2);
    for (const text of ["Check it.", "First progress", "Next progress", "Final result"])
      expect(body.textContent).toContain(text);
    await click("Expand agent responses");
    expect(body.querySelectorAll(".agent-avatar")).toHaveLength(2);
    await click("Collapse agent responses");
    expect(body.querySelectorAll(".agent-avatar")).toHaveLength(2);
  },
);

it("opens the agent chat in its source environment and dismisses the floating view", async () => {
  const agent = workingAgent("Friday");
  state.delegated = [agent];
  await render({
    sourceThreadRef: {
      environmentId: EnvironmentId.make("remote-panel"),
      threadId: ThreadId.make("source"),
    },
    delegatedAgents: [agent.job],
  });
  const link = document.querySelector<HTMLAnchorElement>('[aria-label="Open Friday chat"]');
  expect(link).not.toBeNull();
  await act(async () => link!.click());
  expect(router.history.location.pathname).toBe("/remote-panel/thread-Friday");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("lands on the latest loaded response, reserves space for short replies, and preserves manual scrolling", async () => {
  const first = workingAgent("Friday");
  const latest = {
    ...first,
    job: { ...first.job, activityId: EventId.make("latest-task") },
    data: null,
  };
  const response = (id: string, text: string) => ({
    id: MessageId.make(id),
    role: "assistant" as const,
    text,
    turnId: TurnId.make("task"),
    streaming: false,
    createdAt: "2026-10-02T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute("data-agent-panel-scroll") ? 180 : 0;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.hasAttribute("data-agent-panel-scroll")) return new DOMRect(0, 10, 320, 180);
    const id = this.getAttribute("data-agent-panel-message");
    if (id) {
      const body = document.querySelector<HTMLElement>("[data-agent-panel-scroll]");
      return new DOMRect(0, 10 + (id === "latest" ? 450 : 100) - (body?.scrollTop ?? 0), 200, 40);
    }
    return new DOMRect();
  });
  state.delegated = [
    {
      ...first,
      working: false,
      data: { ...first.data!, status: "completed", messages: [response("old", "Earlier reply")] },
    },
    latest,
  ];
  await render({ delegatedAgents: state.delegated.map(({ job }) => job) });
  const body = document.querySelector<HTMLElement>("[data-agent-panel-scroll]")!;
  expect(body.scrollTop).toBe(0);
  state.delegated[1] = {
    ...latest,
    data: {
      ...first.data!,
      messages: [
        response("summary", "**Task:** Check it."),
        response("progress", "Earlier progress"),
        response("latest", "Latest reply"),
      ],
    },
  };
  await render({ delegatedAgents: state.delegated.map(({ job }) => job) });
  expect(body.scrollTop).toBe(450);
  expect(body.style.paddingBottom).toBe("140px");
  expect(document.querySelector('[data-agent-panel-message="latest"]')?.textContent).toBe(
    "Earlier progressLatest reply",
  );
  body.scrollTop = 125;
  await render({ delegatedAgents: state.delegated.map(({ job }) => job) });
  await click("Expand agent responses");
  expect(body.scrollTop).toBe(125);
  await click("Back to thread overview");
  expect(body.style.paddingBottom).toBe("");
  await click("View Friday responses");
  expect(body.scrollTop).toBe(450);
  expect(window.scrollY).toBe(0);
});

it("keeps a streaming task summary separate from the result", async () => {
  const agent = workingAgent("Friday");
  const message = {
    id: MessageId.make("summary"),
    role: "assistant" as const,
    text: "**Ta",
    turnId: TurnId.make("task"),
    streaming: true,
    createdAt: "2026-10-02T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
  };
  state.delegated = [{ ...agent, data: { ...agent.data!, messages: [message] } }];
  await render({ delegatedAgents: [agent.job] });
  expect(document.querySelector('[aria-label="Result"]')?.textContent).not.toContain("**Ta");
  state.delegated = [
    {
      ...agent,
      data: {
        ...agent.data!,
        messages: [{ ...message, text: "**Task:** I will check the release." }],
      },
    },
  ];
  await render({ delegatedAgents: [agent.job] });
  expect(document.querySelector('[aria-label="Task summary"]')?.textContent).toContain(
    "I will check the release.",
  );
  expect(document.querySelector('[aria-label="Result"]')?.textContent).not.toContain(
    "I will check the release.",
  );
});

it("keeps Git available with no diff and lets it collapse before opening changes", async () => {
  await render({ changes: null, showGit: true });
  await click("Thread overview");
  expect(document.body.textContent).toContain("Changes+0−0");
  await click("Hide Git");
  expect(document.body.textContent).not.toContain("Changes");
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(props.onToggleChanges).not.toHaveBeenCalled();
  await click("Show Git");
  const changes = Array.from(document.querySelectorAll("button")).find((button) =>
    button.textContent?.startsWith("Changes"),
  );
  await act(async () => changes!.click());
  expect(props.onToggleChanges).toHaveBeenCalledOnce();
});

it("reveals large V2 child rosters one page at a time without losing failed results", async () => {
  const { projectedSubagentsToRuntime } =
    await import("@t3tools/client-runtime/state/subagentRuntime");
  const DateTime = await import("effect/DateTime");
  const now = DateTime.makeUnsafe("2026-10-02T00:00:00.000Z");
  const subagents = projectedSubagentsToRuntime(
    Array.from({ length: 20 }, (_, index) => ({
      id: `child-${index}`,
      title: `Child ${index}`,
      prompt: "Check it",
      model: "native-model",
      status: index === 19 ? ("failed" as const) : ("completed" as const),
      result: index === 19 ? "A retained failure" : "Done",
      startedAt: now,
      completedAt: now,
      updatedAt: now,
    })),
  );
  await render({ subagents, agents: { working: 0, done: 20 } });
  await click("Thread overview");
  await click("0 working20 done");
  expect(document.body.textContent).toContain("Child 5");
  expect(document.body.textContent).not.toContain("Child 6");
  await click("Show 12 more");
  expect(document.body.textContent).toContain("Child 17");
  expect(document.body.textContent).not.toContain("Child 19");
  await click("Show 2 more");
  await click("Child 19failed");
  expect(document.body.textContent).toContain("A retained failure");
  await click("Back to subagents");
  expect(document.body.textContent).toContain("Child 19");
});

it("retains an unsaved workspace action and Git selection across collapse and responsive resizing", async () => {
  state.wide = true;
  const controls = {
    workspaceContent: <textarea aria-label="Action draft" defaultValue="Saved action" />,
    versionControlContent: <input aria-label="Git selection" defaultValue="main" />,
  };
  await render(controls);
  await click("Thread overview");
  expect(document.body.textContent).toContain("Workspace");
  const action = document.querySelector<HTMLTextAreaElement>('[aria-label="Action draft"]')!;
  const git = document.querySelector<HTMLInputElement>('[aria-label="Git selection"]')!;
  action.value = "Unsaved action";
  git.value = "feature";
  await click("Hide Git");
  await click("Show Git");
  expect(document.querySelector('[aria-label="Git selection"]')).toBe(git);
  expect(git.value).toBe("feature");
  state.wide = false;
  await render(controls);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click("Thread overview");
  expect(document.querySelector('[aria-label="Action draft"]')).toBe(action);
  expect(action.value).toBe("Unsaved action");
  expect(document.querySelector<HTMLInputElement>('[aria-label="Git selection"]')?.value).toBe(
    "feature",
  );
});

it("keeps a header-mounted agent view inside its original thread column", async () => {
  state.delegated = [workingAgent("Friday")];
  host.setAttribute("data-chat-header", "");
  vi.spyOn(host, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1200, 52));
  const column = document.createElement("div");
  vi.spyOn(column, "getBoundingClientRect").mockReturnValue(new DOMRect(300, 52, 260, 180));
  await render({
    delegatedAgents: state.delegated.map(({ job }) => job),
    threadBoundaryRef: { current: column },
  });
  const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(panel.style.width).toBe("236px");
  expect(panel.style.height).toBe("156px");
  expect(document.querySelector('[aria-label="Expand agent responses"]')).toBeNull();
});

it("keeps Workspace usable within the thread frame when the right panel is maximized", async () => {
  host.setAttribute("data-chat-header", "");
  const workspace = document.createElement("div");
  workspace.setAttribute("data-chat-workspace-panels", "");
  const column = document.createElement("div");
  column.setAttribute("data-chat-column-maximized-away", "true");
  workspace.appendChild(column);
  vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue(new DOMRect(300, 52, 700, 500));
  vi.spyOn(column, "getBoundingClientRect").mockReturnValue(new DOMRect(300, 52, 0, 500));
  await render({ threadBoundaryRef: { current: column } });
  await click("Thread overview");
  const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(panel.style.width).toBe("320px");
  expect(panel.style.maxWidth).toBe("676px");
  expect(document.body.textContent).toContain("Workspace");
});

it("keeps workspace and sources available without the agent section in agent and channel chats", async () => {
  await render({
    showAgents: false,
    showGit: false,
    workspaceContent: <button>Open in Finder</button>,
  });
  await click("Thread overview");
  expect(document.body.textContent).toContain("Open in Finder");
  expect(document.body.textContent).toContain("Sources");
  expect(document.body.textContent).not.toContain("1 working");
  expect(document.body.textContent).not.toContain("2 done");
  expect(document.body.textContent).not.toContain("Version Control");
});

it("keeps incoming responses hidden until the details panel closes", async () => {
  const onOpenChange = vi.fn();
  const agent = workingAgent("Friday");
  state.delegated = [agent];
  await render({ hidden: true, onOpenChange, delegatedAgents: [agent.job] });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(onOpenChange).not.toHaveBeenCalledWith(true);
  await render({ hidden: false, onOpenChange, delegatedAgents: [agent.job] });
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
});

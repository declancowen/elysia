// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { EventId, MessageId, ProjectId, ThreadId, TurnId } from "@t3tools/contracts";
import type { DelegatedAgentView } from "../agents/useDelegatedAgents";

const state = vi.hoisted(() => ({
  wide: false,
  code: true,
  delegated: [] as DelegatedAgentView[],
}));
vi.mock("~/hooks/useMediaQuery", () => ({ useMediaQuery: () => state.wide }));
vi.mock("~/hooks/useSettings", () => ({ useCodeWorkspace: () => state.code }));
vi.mock("../agents/useDelegatedAgents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../agents/useDelegatedAgents")>()),
  useDelegatedAgents: () => state.delegated,
}));
vi.mock("../ChatMarkdown", () => ({ default: ({ text }: { text: string }) => <p>{text}</p> }));

import { ThreadOverviewPanel, type ThreadOverviewPanelProps } from "./ThreadOverviewPanel";
import { openThreadOverviewAgent, useThreadOverviewStore } from "./threadOverviewStore";
import { EnvironmentId } from "@t3tools/contracts";
import type { ChatAttachment } from "~/types";

let root: Root;
let host: HTMLDivElement;
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
  await act(async () => root.render(<ThreadOverviewPanel {...props} {...overrides} />));
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

beforeEach(() => {
  state.wide = false;
  state.code = true;
  state.delegated = [];
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
  vi.unstubAllGlobals();
});

it("shows three recent uploads, expands older uploads, and dismisses outside on a narrow screen", async () => {
  await render();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click("Thread overview");
  expect(document.body.textContent).toContain("recent.pdf");
  expect(document.body.textContent).not.toContain("older.txt");
  await click("Show all sources");
  expect(document.body.textContent).toContain("older.txt");
  await outsidePress();
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
  expect((document.querySelector('[role="dialog"]') as HTMLElement).style.height).toBe("454px");
  expect((document.querySelector('[role="dialog"]') as HTMLElement).style.width).toBe("660px");
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
  expect(document.body.textContent).toContain("Friday");
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
  await click("Show changes");
  expect(props.onToggleChanges).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  state.code = false;
  state.delegated = [workingAgent("Friday")];
  await render({ delegatedAgents: state.delegated.map(({ job }) => job) });
  const responses = document.querySelector('[role="dialog"]') as HTMLElement;
  expect(document.body.textContent).toContain("Working");
  expect(document.querySelector('[aria-label="Show changes"]')).toBeNull();
  const height = responses.style.height;
  await click("Expand agent responses");
  expect(responses.style.width).toBe("calc(100vw - 2rem)");
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

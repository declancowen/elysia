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
vi.mock("../agents/useDelegatedAgents", () => ({ useDelegatedAgents: () => state.delegated }));
vi.mock("../ChatMarkdown", () => ({ default: ({ text }: { text: string }) => <p>{text}</p> }));

import { ThreadOverviewPanel, type ThreadOverviewPanelProps } from "./ThreadOverviewPanel";
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
  onOpenAgents: vi.fn(),
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

it("opens only the floating overview until a full-panel action is chosen", async () => {
  await render();
  await click("Thread overview");
  expect(props.onToggleChanges).not.toHaveBeenCalled();
  expect(props.onOpenAgents).not.toHaveBeenCalled();
  expect(props.onOpenSources).not.toHaveBeenCalled();
  await click("1 working2 done");
  expect(props.onOpenAgents).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
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

it("auto-opens grouped working agents and keeps dismissing a read-only response separate from the task", async () => {
  state.delegated = [workingAgent("Friday"), workingAgent("Edna"), workingAgent("Rocket")];
  const jobs = state.delegated.map(({ job }) => job);
  await render({ delegatedAgents: jobs });
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.body.textContent).toContain("3 working");
  expect(document.body.textContent!.indexOf("Agents")).toBeLessThan(
    document.body.textContent!.indexOf("Subagents"),
  );
  state.delegated[0] = {
    ...state.delegated[0]!,
    data: {
      ...state.delegated[0]!.data!,
      messages: [
        {
          id: MessageId.make("friday-reply"),
          role: "assistant",
          text: "Task-only response",
          turnId: TurnId.make("turn-Friday"),
          streaming: true,
          createdAt: "2026-10-02T00:00:00.000Z",
          updatedAt: "2026-10-02T00:00:01.000Z",
        },
      ],
    },
  };
  await render({ delegatedAgents: jobs });
  expect(document.body.textContent).toContain("Task-only response");
  expect(document.querySelector('input, textarea, [contenteditable="true"]')).toBeNull();
  await click("Dismiss Friday response");
  expect(document.body.textContent).not.toContain("Task-only response");
  expect(document.body.textContent).toContain("3 working");
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

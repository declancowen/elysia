// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";

const state = vi.hoisted(() => ({ wide: false, docked: vi.fn() }));
vi.mock("~/hooks/useMediaQuery", () => ({ useMediaQuery: () => state.wide }));
vi.mock("~/hooks/useSettings", () => ({
  useCodeWorkspace: () => false,
  useClientSettings: () => ({}),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn(), Link: "a" }));
vi.mock("../agents/useAgentActions", () => ({
  useAgentActions: () => ({ pending: false, archive: vi.fn() }),
}));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../agents/useDelegatedAgents", async (original) => ({
  ...(await original<typeof import("../agents/useDelegatedAgents")>()),
  useDelegatedAgents: () => [],
}));
vi.mock("../agents/useAgents", () => ({
  useAgents: () => [
    {
      project: {
        environmentId: EnvironmentId.make("local"),
        id: ProjectId.make("channel"),
        title: "Design",
        agentProfile: {
          title: "Agent channel",
          instructions: "Work together",
          archived: false,
          group: { memberProjectIds: [], leadProjectId: ProjectId.make("lead") },
        },
      },
      thread: { environmentId: EnvironmentId.make("local"), id: ThreadId.make("conversation") },
      busy: false,
    },
  ],
}));
import { AgentDetailsPopover } from "../agents/AgentDetailsPopover";
import { ThreadOverviewPanel } from "./ThreadOverviewPanel";
import { useChatHeaderPanels } from "./useChatHeaderPanels";

function Panels() {
  const panels = useChatHeaderPanels("local:channel", state.wide, state.docked);
  return (
    <>
      <AgentDetailsPopover
        projectRef={scopeProjectRef(EnvironmentId.make("local"), ProjectId.make("channel"))}
        open={panels.detailsOpen}
        wide={state.wide}
        onOpenChange={panels.detailsChanged}
        onHeightChange={panels.setDetailsHeight}
      />
      <ThreadOverviewPanel
        threadKey="conversation"
        label="Elysia"
        changes={null}
        agents={{ working: 0, done: 0 }}
        sources={[]}
        onToggleChanges={() => {}}
        onOpenSources={() => {}}
        onAddSources={() => {}}
        onOpenSource={() => {}}
        onOpenChange={panels.overviewChanged}
        onDockedChange={panels.setOverviewDocked}
        dismissKey={panels.dismissOverview}
        panelOffset={panels.panelOffset}
      />
    </>
  );
}
let host: HTMLDivElement;
let root: Root;
async function click(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    button!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    button!.click();
  });
}
beforeEach(() => {
  state.wide = false;
  state.docked.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return new DOMRect(0, 0, 320, this.getAttribute("data-slot") === "popover-popup" ? 220 : 50);
  });
  host = document.createElement("div");
  host.setAttribute("data-chat-header", "");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("replaces panels in overflow and puts clearing only in agent/channel details", async () => {
  await act(async () => root.render(<Panels />));
  await click("Thread overview");
  expect(document.body.textContent).toContain("Sources");
  expect(document.querySelector('[aria-label="Clear chat and context"]')).toBeNull();
  await click("Manage Design");
  expect(document.body.textContent).toContain("Channel description");
  expect(document.querySelector('[aria-label="Clear chat and context"]')).not.toBeNull();
  expect(document.body.textContent).not.toContain("Agent channel");
  expect(document.body.textContent).not.toContain("Sources");
  await click("Thread overview");
  expect(document.body.textContent).toContain("Sources");
  expect(document.body.textContent).not.toContain("Channel description");
});
it("stacks wide panels and returns the overview to the top when details dismiss", async () => {
  state.wide = true;
  await act(async () => root.render(<Panels />));
  await click("Thread overview");
  await click("Manage Design");
  expect(document.body.textContent).toContain("Sources");
  expect(document.body.textContent).toContain("Channel description");
  expect(host.querySelector('span[aria-hidden][style*="232px"]')).not.toBeNull();
  expect(state.docked).toHaveBeenLastCalledWith(true);
  await act(async () => {
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    document.body.click();
  });
  expect(document.body.textContent).not.toContain("Channel description");
  expect(document.body.textContent).toContain("Sources");
  expect(host.querySelector('span[aria-hidden][style*="232px"]')).toBeNull();
  expect(state.docked).toHaveBeenLastCalledWith(true);
});

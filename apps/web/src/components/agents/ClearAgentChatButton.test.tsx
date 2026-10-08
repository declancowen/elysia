// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, ThreadId } from "@elysiatools/contracts";
const state = vi.hoisted(() => ({
  confirm: vi.fn(),
  reset: vi.fn(),
  navigate: vi.fn(),
  clearDraft: vi.fn(),
  retarget: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => state.navigate }));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => state.reset }));
vi.mock("~/state/projects", () => ({ projectEnvironment: { resetAgent: {} } }));
vi.mock("~/localApi", () => ({ readLocalApi: () => ({ dialogs: { confirm: state.confirm } }) }));
vi.mock("~/composerDraftStore", () => ({
  useComposerDraftStore: { getState: () => ({ clearDraftThread: state.clearDraft }) },
}));
vi.mock("~/conversationTabsStore", () => ({
  useConversationTabsStore: { getState: () => ({ retarget: state.retarget }) },
}));
vi.mock("../ui/toast", () => ({ toastManager: { add: state.toast } }));
import { ClearAgentChatButton } from "./ClearAgentChatButton";
let root: Root;
let host: HTMLDivElement;
const threadRef = { environmentId: EnvironmentId.make("local"), threadId: ThreadId.make("old") };
const target = { projectId: ProjectId.make("alex"), name: "Alex", channel: false, threadRef };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.confirm.mockResolvedValue(true);
  state.reset.mockResolvedValue({
    _tag: "Success",
    value: { projectId: target.projectId, threadId: ThreadId.make("fresh") },
  });
  state.navigate.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function click(channel = false) {
  await act(async () => root.render(<ClearAgentChatButton target={{ ...target, channel }} />));
  await act(async () => host.querySelector("button")!.click());
}
it("cancel keeps the conversation and memory intact", async () => {
  state.confirm.mockResolvedValue(false);
  await click();
  expect(state.confirm).toHaveBeenCalledWith(expect.stringContaining("This cannot be undone"), {
    variant: "destructive",
  });
  expect(state.reset).not.toHaveBeenCalled();
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.clearDraft).not.toHaveBeenCalled();
});
it("confirmed reset replaces the tab and clears the old composer before opening a fresh chat", async () => {
  await click();
  expect(host.querySelector("button")?.textContent).toContain("Reset agent");
  expect(state.reset).toHaveBeenCalledWith({
    environmentId: threadRef.environmentId,
    input: expect.objectContaining({
      projectId: target.projectId,
      previousThreadId: threadRef.threadId,
    }),
  });
  expect(state.retarget).toHaveBeenCalledWith(
    { kind: "server", threadRef },
    { kind: "server", threadRef: { ...threadRef, threadId: "fresh" } },
  );
  expect(state.clearDraft).toHaveBeenCalledWith(threadRef);
  expect(state.navigate).toHaveBeenCalledWith({
    to: "/$environmentId/$threadId",
    params: { environmentId: "local", threadId: "fresh" },
  });
});
it("explains that clearing a channel preserves member agents' separate memory", async () => {
  await click(true);
  expect(host.querySelector("button")?.textContent).toContain("Reset channel");
  expect(state.confirm).toHaveBeenCalledWith(
    expect.stringContaining("Member agents keep their separate chats and memories"),
    { variant: "destructive" },
  );
});
it("failed reset stays on the chat and retries the same request safely", async () => {
  state.reset.mockResolvedValueOnce({ _tag: "Failure" });
  await click();
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.toast).toHaveBeenCalled();
  const request = state.reset.mock.calls[0]?.[0];
  await act(async () => host.querySelector("button")!.click());
  expect(state.reset.mock.calls[1]?.[0]).toEqual(request);
});

it("clearing a response side panel keeps the source thread open", async () => {
  const onCleared = vi.fn();
  await act(async () =>
    root.render(<ClearAgentChatButton target={target} onCleared={onCleared} />),
  );
  await act(async () => host.querySelector("button")!.click());
  expect(onCleared).toHaveBeenCalledOnce();
  expect(state.navigate).not.toHaveBeenCalled();
});

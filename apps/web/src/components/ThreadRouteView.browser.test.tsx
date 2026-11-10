import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, ThreadId, type ScopedThreadRef } from "@elysiatools/contracts";
import { scopeProjectRef, scopeThreadRef } from "@elysiatools/client-runtime/environment";
import { EMPTY_ENVIRONMENT_THREAD_STATE } from "@elysiatools/client-runtime/state/threads";
import { act, render } from "../../test/render";
import {
  DraftId,
  finalizePromotedDraftThreadByRef,
  useComposerDraftStore,
} from "../composerDraftStore";
import { useConversationTabsStore } from "../conversationTabsStore";
import { ThreadRouteView } from "./ThreadRouteView";

const fixture = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => fixture.navigate,
}));
vi.mock("../state/entities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/entities")>()),
  useEnvironmentThreadRefs: () => [],
  useQuietThreadShell: (ref: ScopedThreadRef | null) =>
    ref?.threadId === "thread" ? { projectId: "project", archivedAt: null } : null,
  useProject: () => null,
}));
vi.mock("../state/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/shell")>()),
  useEnvironmentShellStatus: () => "live",
}));
vi.mock("../state/threads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/threads")>()),
  useEnvironmentThread: () => EMPTY_ENVIRONMENT_THREAD_STATE,
}));
vi.mock("./ChatView", () => ({
  default: function RetainedChat() {
    const [text, setText] = useState("");
    return (
      <input
        aria-label="Chat draft"
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
      />
    );
  },
}));

it.each(["/usage", "/settings/general", "/settings/scheduled-tasks"] as const)(
  "retains the composer without taking back the active %s tab",
  async (path) => {
    fixture.navigate.mockReset();
    useConversationTabsStore.setState({ tabs: [], activeId: null });
    const target = {
      kind: "server" as const,
      threadRef: scopeThreadRef(EnvironmentId.make("environment"), ThreadId.make("thread")),
    };
    await using screen = await render(<ThreadRouteView target={target} />, { router: false });
    const input = screen.container.querySelector<HTMLInputElement>("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "Keep my draft",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
      useConversationTabsStore.getState().open({ kind: "surface", path, title: "Utility" }, true);
    });
    const utilityId = useConversationTabsStore.getState().activeId;
    // The background thread can receive new shell props while another route owns navigation.
    await screen.rerender(<ThreadRouteView target={{ ...target }} background />);
    expect(useConversationTabsStore.getState().activeId).toBe(utilityId);
    expect(useConversationTabsStore.getState().tabs).toHaveLength(2);
    expect(fixture.navigate).not.toHaveBeenCalled();
    await screen.rerender(<ThreadRouteView target={target} />);
    expect(useConversationTabsStore.getState().activeId).not.toBe(utilityId);
    expect(screen.container.querySelector<HTMLInputElement>("input")!.value).toBe("Keep my draft");
    useConversationTabsStore.setState({ tabs: [], activeId: null });
  },
);

it.each([false, true])(
  "keeps the sent chat and its tab when draft promotion finishes (background=%s)",
  async (background) => {
    fixture.navigate.mockReset();
    const tabs = useConversationTabsStore;
    tabs.setState({ tabs: [], activeId: null });
    const environmentId = EnvironmentId.make("environment");
    const draftId = DraftId.make(`send-draft-${background}`);
    const threadId = ThreadId.make(`sent-thread-${background}`);
    const threadRef = scopeThreadRef(environmentId, threadId);
    const draft = { kind: "draft" as const, draftId };
    const sent = { kind: "server" as const, threadRef };
    useComposerDraftStore
      .getState()
      .setProjectDraftThreadId(scopeProjectRef(environmentId, ProjectId.make("project")), draftId, {
        threadId,
      });
    // This fixture captures route requests while rendering draft and server targets explicitly.
    await using screen = await render(<ThreadRouteView target={draft} />, { router: false });
    const composer = screen.container.querySelector("input");
    const draftTabId = tabs.getState().activeId;
    if (background) {
      tabs.getState().open({ kind: "surface", path: "/usage", title: "Usage" }, true);
      await screen.rerender(<ThreadRouteView target={draft} background />);
    }
    const activeId = tabs.getState().activeId;
    await act(() => finalizePromotedDraftThreadByRef(threadRef));
    if (background) {
      expect(fixture.navigate).not.toHaveBeenCalled();
      expect(tabs.getState().activeId).toBe(activeId);
      await screen.rerender(<ThreadRouteView target={draft} />);
    }
    expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/$environmentId/$threadId",
      params: { environmentId, threadId },
      replace: true,
    });
    expect(tabs.getState().activeId).toBe(draftTabId);
    expect(tabs.getState().tabs.find((tab) => tab.id === draftTabId)?.target).toEqual(sent);
    await screen.rerender(<ThreadRouteView target={sent} />);
    expect(composer).not.toBeNull();
    expect(screen.container.querySelector("input")).toBe(composer);
  },
);

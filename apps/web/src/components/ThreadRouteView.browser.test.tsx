import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@elysiatools/contracts";
import { scopeThreadRef } from "@elysiatools/client-runtime/environment";
import { act, render } from "../../test/render";
import { useConversationTabsStore } from "../conversationTabsStore";
import { ThreadRouteView } from "./ThreadRouteView";

const fixture = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => fixture.navigate,
}));
vi.mock("../state/entities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/entities")>()),
  useThreadRefs: () => [],
  useEnvironmentThreadRefs: () => [],
  useQuietThreadShell: () => ({
    id: "thread",
    projectId: "project",
    archivedAt: null,
    latestRun: null,
    itemCount: 0,
    runtime: null,
  }),
  useProject: () => null,
}));
vi.mock("../state/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/shell")>()),
  useEnvironmentShellStatus: () => "live",
}));
vi.mock("../state/threads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/threads")>()),
  useEnvironmentThread: () => null,
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

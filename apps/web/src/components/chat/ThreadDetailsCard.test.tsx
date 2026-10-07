import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";

vi.mock("../../hooks/useSettings", () => ({
  useClientSettings: (select: (settings: { panelAnimationDurationMs: number }) => unknown) =>
    select({ panelAnimationDurationMs: 180 }),
}));
vi.mock("../../hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));
vi.mock("./ChatCanvasContext", () => ({
  useChatCanvas: () => ({
    container: { width: 1200, height: 800 },
    lane: { padding: 24, minChatWidth: 560 },
    layout: { frame: null, overlapsDetailsCard: false },
  }),
}));
vi.mock("../ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("../ui/popover", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ui/popover")>()),
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverPopup: () => null,
}));

import { PopoverCreateHandle } from "../ui/popover";
import { useRightPanelStore } from "../../rightPanelStore";
import { ThreadDetailsCard } from "./ThreadDetailsCard";

let renderer: ReactTestRenderer | null = null;
const threadRef = {
  environmentId: EnvironmentId.make("local"),
  threadId: ThreadId.make("details-test"),
};
afterEach(async () => {
  await act(() => renderer?.unmount());
  useRightPanelStore.getState().setThreadPanelOpen(threadRef, "inline", false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("opens without a render loop and retains the closing details until motion finishes", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("window", {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
  useRightPanelStore.getState().setThreadPanelOpen(threadRef, "inline", true);
  await act(() => {
    renderer = create(
      <ThreadDetailsCard
        threadRef={threadRef}
        anchor={{ current: null }}
        handle={PopoverCreateHandle()}
        onPresentationChange={() => {}}
      >
        {() => <p>Thread details content</p>}
      </ThreadDetailsCard>,
    );
  });
  expect(renderer!.root.findAllByType("aside")).toHaveLength(1);
  await act(() => useRightPanelStore.getState().setThreadPanelOpen(threadRef, "inline", false));
  expect(renderer!.root.findAllByType("aside")).toHaveLength(1);
  await act(() => {
    vi.advanceTimersByTime(180);
  });
  expect(renderer!.root.findAllByType("aside")).toHaveLength(0);
});

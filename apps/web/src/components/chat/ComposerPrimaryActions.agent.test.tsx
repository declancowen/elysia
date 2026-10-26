vi.mock("vite-plus/test/browser", () => ({
  page: { elementLocator: () => ({}) },
  utils: { getElementLocatorSelectors: () => ({}) },
}));
import { render as renderUi } from "../../../test/render";
import { act } from "../../../test/act";
// @vitest-environment jsdom

import { expect, it, vi } from "vite-plus/test";

vi.mock("~/hooks/useSettings", () => ({
  getEnvironmentIdentificationMode: () => "none",
  useClientSettings: (select: (settings: { redesignEnabled: boolean }) => unknown) =>
    select({ redesignEnabled: false }),
}));
vi.mock("../SidebarStageBackdrop", () => ({ useSidebarStageBackdropVariant: () => null }));

import { ComposerPrimaryActions } from "./ComposerPrimaryActions";

it("implements an agent plan in its existing conversation and keeps the new-thread menu for regular projects", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  await using root = await renderUi(null, { container: container, router: false });
  const implement = vi.fn();
  const implementInNewThread = vi.fn();
  const render = (allowImplementPlanInNewThread: boolean) =>
    root.rerender(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          implement();
        }}
      >
        <ComposerPrimaryActions
          canOperateThread
          compact={false}
          pendingAction={null}
          isRunning={false}
          canInterrupt={false}
          showPlanFollowUpPrompt
          promptHasText={false}
          isSendBusy={false}
          sendDisabledReason={null}
          isConnecting={false}
          isEnvironmentUnavailable={false}
          isPreparingWorktree={false}
          hasSendableContent={false}
          allowImplementPlanInNewThread={allowImplementPlanInNewThread}
          onPreviousPendingQuestion={() => {}}
          onInterrupt={() => {}}
          onImplementPlanInNewThread={implementInNewThread}
        />
      </form>,
    );
  try {
    await act(async () => render(false));
    expect(container.querySelector('button[aria-label="Implementation actions"]')).toBeNull();
    const implementButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Implement",
    );
    expect(implementButton).toBeDefined();
    await act(async () => implementButton!.click());
    expect(implement).toHaveBeenCalledOnce();
    expect(implementInNewThread).not.toHaveBeenCalled();

    await act(async () => render(true));
    const menuTrigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Implementation actions"]',
    );
    expect(menuTrigger).not.toBeNull();
    await act(async () => menuTrigger!.click());
    const newThreadAction = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.includes("Implement in a new thread"),
    );
    expect(newThreadAction).toBeDefined();
    await act(async () => newThreadAction!.click());
    expect(implementInNewThread).toHaveBeenCalledOnce();
    expect(implement).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

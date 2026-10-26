vi.mock("vite-plus/test/browser", () => ({
  page: { elementLocator: () => ({}) },
  utils: { getElementLocatorSelectors: () => ({}) },
}));
import { render as renderUi } from "../../../test/render";
import { act } from "../../../test/act";
// @vitest-environment jsdom

import { expect, it, vi } from "vite-plus/test";

import { PanelLayoutControls } from "./PanelLayoutControls";

it("hides terminal access in Work and restores its open state when returning to Code", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  await using root = await renderUi(null, { container: container, router: false });
  const render = (showTerminalControl: boolean) =>
    root.rerender(
      <PanelLayoutControls
        showTerminalControl={showTerminalControl}
        terminalAvailable
        terminalOpen
        terminalShortcutLabel={null}
        rightPanelAvailable
        rightPanelOpen={false}
        rightPanelShortcutLabel={null}
        liveAgentCount={0}
        onToggleTerminal={() => undefined}
        onToggleRightPanel={() => undefined}
      />,
    );
  const terminalToggle = () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Toggle terminal drawer"]');

  try {
    await act(async () => render(true));
    expect(terminalToggle()?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-panel-layout-controls]")!.children).toHaveLength(2);
    await act(async () => render(false));
    expect(terminalToggle()).toBeNull();
    expect(container.querySelector("[data-panel-layout-controls]")!.children).toHaveLength(1);
    expect(container.querySelector('button[aria-label="Toggle right panel"]')).not.toBeNull();
    await act(async () => render(true));
    expect(terminalToggle()?.getAttribute("aria-pressed")).toBe("true");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

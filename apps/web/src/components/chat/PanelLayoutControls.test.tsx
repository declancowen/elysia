// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

import { PanelLayoutControls } from "./PanelLayoutControls";

it("hides terminal access in Work and restores its open state when returning to Code", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (showTerminalControl: boolean) =>
    root.render(
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
    await act(async () => render(false));
    expect(terminalToggle()).toBeNull();
    expect(container.querySelector('button[aria-label="Toggle right panel"]')).not.toBeNull();
    await act(async () => render(true));
    expect(terminalToggle()?.getAttribute("aria-pressed")).toBe("true");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

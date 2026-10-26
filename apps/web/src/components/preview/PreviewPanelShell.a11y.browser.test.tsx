import { Dialog } from "@base-ui/react/dialog";
import { act, render } from "../../../test/render";
import { describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { PanelLayoutControls } from "../chat/PanelLayoutControls";
import { PreviewPanelShell, type PreviewPanelMode } from "./PreviewPanelShell";

function panel(open: boolean | undefined, mode: PreviewPanelMode = "inline", present = true) {
  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Popup aria-label="Workspace" finalFocus={false}>
          {present ? (
            <PreviewPanelShell mode={mode} {...(open === undefined ? {} : { open })}>
              <input aria-label="Preview URL" />
              <button type="button">Reload preview</button>
            </PreviewPanelShell>
          ) : null}
          <button type="button" data-testid="outside">
            Send message
          </button>
          <div key={present ? "root-controls" : "header-controls"}>
            <PanelLayoutControls
              showTerminalControl={false}
              terminalAvailable={false}
              terminalOpen={false}
              terminalShortcutLabel={null}
              liveAgentCount={0}
              rightPanelAvailable
              rightPanelOpen={open ?? true}
              rightPanelShortcutLabel={null}
              onToggleTerminal={() => {}}
              onToggleRightPanel={() => {}}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Tabbing past the popup's last control wraps through Base UI's focus guard
// to the first tabbable descendant, which skips anything inert.
async function enterFocusScope() {
  const toggle = document.querySelector<HTMLElement>('[aria-label="Toggle right panel"]')!;
  await act(async () => toggle.focus());
  await userEvent.tab();
}

describe("right panel keyboard access", () => {
  it("skips collapsed controls and restores access after reopening", async () => {
    await using screen = await render(panel(false));
    const outside = document.querySelector<HTMLElement>('[data-testid="outside"]')!;
    await expect.poll(() => document.activeElement).toBe(outside);
    await enterFocusScope();
    await expect.poll(() => document.activeElement).toBe(outside);

    await screen.rerender(panel(true));
    await enterFocusScope();
    await expect
      .poll(() => document.activeElement)
      .toBe(document.querySelector('[aria-label="Preview URL"]'));

    await screen.rerender(panel(false));
    await enterFocusScope();
    await expect.poll(() => document.activeElement).toBe(outside);
  });

  it("returns focus to the right-panel toggle when a focused panel closes", async () => {
    await using screen = await render(panel(true));
    const input = document.querySelector<HTMLInputElement>('[aria-label="Preview URL"]')!;
    await act(async () => input.focus());
    await screen.rerender(panel(false));
    await expect
      .poll(() => document.activeElement)
      .toBe(document.querySelector('[aria-label="Toggle right panel"]'));
    await screen.rerender(panel(true));
    await enterFocusScope();
    await expect.poll(() => document.activeElement).toBe(input);
  });

  it("retains focus after the closing animation relocates the toggle", async () => {
    await using screen = await render(panel(true));
    await act(async () => {
      document.querySelector<HTMLInputElement>('[aria-label="Preview URL"]')!.focus();
    });
    await screen.rerender(panel(false));
    const closingToggle = document.querySelector('[aria-label="Toggle right panel"]');
    await expect.poll(() => document.activeElement).toBe(closingToggle);
    await screen.rerender(panel(false, "inline", false));
    const settledToggle = document.querySelector('[aria-label="Toggle right panel"]');
    expect(settledToggle).not.toBe(closingToggle);
    await expect.poll(() => document.activeElement).toBe(settledToggle);
  });

  it("returns focus when the panel closes without an animation", async () => {
    await using screen = await render(panel(true));
    await act(async () => {
      document.querySelector<HTMLInputElement>('[aria-label="Preview URL"]')!.focus();
    });
    await screen.rerender(panel(false, "inline", false));
    await expect
      .poll(() => document.activeElement)
      .toBe(document.querySelector('[aria-label="Toggle right panel"]'));
  });

  it("preserves focus moved outside while the closing animation settles", async () => {
    await using screen = await render(panel(true));
    await act(async () => {
      document.querySelector<HTMLInputElement>('[aria-label="Preview URL"]')!.focus();
    });
    await screen.rerender(panel(false));
    const outside = document.querySelector<HTMLButtonElement>('[data-testid="outside"]')!;
    await act(async () => outside.focus());
    await screen.rerender(panel(false, "inline", false));
    await expect.poll(() => document.activeElement).toBe(outside);
  });

  it("preserves focus outside the panel when it closes", async () => {
    await using screen = await render(panel(true));
    const outside = document.querySelector<HTMLButtonElement>('[data-testid="outside"]')!;
    await act(async () => outside.focus());
    await screen.rerender(panel(false));
    await expect.poll(() => document.activeElement).toBe(outside);
  });

  it.each(["sheet", "sidebar", "embedded"] as const)(
    "keeps %s controls reachable when the inline open flag is false",
    async (mode) => {
      await using _screen = await render(panel(false, mode));
      await expect
        .poll(() => document.activeElement)
        .toBe(document.querySelector('[aria-label="Preview URL"]'));
    },
  );

  it("keeps non-collapsible inline controls reachable", async () => {
    await using _screen = await render(panel(undefined));
    await expect
      .poll(() => document.activeElement)
      .toBe(document.querySelector('[aria-label="Preview URL"]'));
  });
});

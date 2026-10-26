import { useLayoutEffect } from "react";
import { act, render, fakeTimers } from "../test/render";
import { describe, expect, it, vi } from "vite-plus/test";

import { usePanelNavigationSuppression, usePanelPresence } from "./panelAnimations";

let observed: boolean[] = [];

function SuppressionProbe({ navigationKey }: { navigationKey: string }) {
  const suppressed = usePanelNavigationSuppression(navigationKey);
  useLayoutEffect(() => {
    observed.push(suppressed);
  }, [suppressed]);
  return null;
}

function timers(): Disposable {
  observed = [];
  return fakeTimers();
}

describe("usePanelPresence", () => {
  let presence: { present: boolean; value: string | null };
  function PresenceProbe({
    open,
    scopeKey = "task-one",
    animated = true,
  }: {
    open: boolean;
    scopeKey?: string;
    animated?: boolean;
  }) {
    const panel = usePanelPresence(open, open ? "chat-one" : null, animated, scopeKey, 180);
    useLayoutEffect(() => {
      presence = panel;
    }, [panel]);
    return null;
  }

  it("retains the closing chat for the transition and cancels removal when reopened", async () => {
    using _timers = timers();
    await using screen = await render(<PresenceProbe open />);
    await screen.rerender(<PresenceProbe open={false} />);
    expect(presence).toEqual({ present: true, value: "chat-one" });
    await act(() => vi.advanceTimersByTime(90));
    await screen.rerender(<PresenceProbe open />);
    await act(() => vi.advanceTimersByTime(180));
    expect(presence).toEqual({ present: true, value: "chat-one" });
    await screen.rerender(<PresenceProbe open={false} />);
    await act(() => vi.advanceTimersByTime(180));
    expect(presence).toEqual({ present: false, value: null });
  });

  it("never retains a chat across document scopes or when motion is disabled", async () => {
    using _timers = timers();
    await using screen = await render(<PresenceProbe open />);
    await screen.rerender(<PresenceProbe open={false} scopeKey="task-two" />);
    expect(presence).toEqual({ present: false, value: null });
    await screen.rerender(<PresenceProbe open />);
    await screen.rerender(<PresenceProbe open={false} animated={false} />);
    expect(presence).toEqual({ present: false, value: null });
    await screen.rerender(<PresenceProbe open={false} animated />);
    expect(presence).toEqual({ present: false, value: null });
  });

  it("renders fresh object values without looping and retains the latest committed content", async () => {
    using _timers = timers();
    const host = document.createElement("div");
    function ObjectPresenceProbe({ open, title }: { open: boolean; title: string }) {
      const panel = usePanelPresence(open, { title }, true, "thread-one", 180);
      return panel.present ? <span>{panel.value?.title}</span> : null;
    }

    await using screen = await render(<ObjectPresenceProbe open title="Initial panel" />, {
      container: host,
    });
    expect(host.textContent).toBe("Initial panel");
    await screen.rerender(<ObjectPresenceProbe open title="Updated panel" />);
    expect(host.textContent).toBe("Updated panel");
    const openContent = host.firstChild;
    await screen.rerender(<ObjectPresenceProbe open={false} title="Closed input" />);
    expect(host.textContent).toBe("Updated panel");
    expect(host.firstChild).toBe(openContent);
    await act(() => vi.advanceTimersByTime(180));
    expect(host.textContent).toBe("");
  });
});

async function paintPendingFrame() {
  await act(() => vi.advanceTimersToNextFrame());
}

describe("usePanelNavigationSuppression", () => {
  it("suppresses initial and navigated panel state until each route has painted", async () => {
    using _timers = timers();
    await using screen = await render(<SuppressionProbe navigationKey="/thread/one" />);
    expect(observed.at(-1)).toBe(true);

    await paintPendingFrame();
    expect(observed.at(-1)).toBe(true);
    await paintPendingFrame();
    expect(observed.at(-1)).toBe(false);

    await screen.rerender(<SuppressionProbe navigationKey="/thread/two" />);
    expect(observed.at(-1)).toBe(true);

    await paintPendingFrame();
    expect(observed.at(-1)).toBe(true);
    await paintPendingFrame();
    expect(observed.at(-1)).toBe(false);
  });
});

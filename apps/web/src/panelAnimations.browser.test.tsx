import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { usePanelNavigationSuppression, usePanelPresence } from "./panelAnimations";

let root: Root;
let pendingFrames: FrameRequestCallback[] = [];
let observed: boolean[] = [];

function SuppressionProbe({ navigationKey }: { navigationKey: string }) {
  const suppressed = usePanelNavigationSuppression(navigationKey);
  useLayoutEffect(() => {
    observed.push(suppressed);
  }, [suppressed]);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  pendingFrames = [];
  observed = [];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Frames are stepped by hand so each assertion lands between two paints.
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    pendingFrames.push(callback);
    return pendingFrames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  root = createRoot(document.createElement("div"));
});

afterEach(async () => {
  await act(() => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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
    await act(() => {
      root.render(<PresenceProbe open />);
    });
    await act(() => root.render(<PresenceProbe open={false} />));
    expect(presence).toEqual({ present: true, value: "chat-one" });
    await act(() => vi.advanceTimersByTime(90));
    await act(() => root.render(<PresenceProbe open />));
    await act(() => vi.advanceTimersByTime(180));
    expect(presence).toEqual({ present: true, value: "chat-one" });
    await act(() => root.render(<PresenceProbe open={false} />));
    await act(() => vi.advanceTimersByTime(180));
    expect(presence).toEqual({ present: false, value: null });
  });

  it("never retains a chat across document scopes or when motion is disabled", async () => {
    await act(() => {
      root.render(<PresenceProbe open />);
    });
    await act(() => root.render(<PresenceProbe open={false} scopeKey="task-two" />));
    expect(presence).toEqual({ present: false, value: null });
    await act(() => root.render(<PresenceProbe open />));
    await act(() => root.render(<PresenceProbe open={false} animated={false} />));
    expect(presence).toEqual({ present: false, value: null });
    await act(() => root.render(<PresenceProbe open={false} animated />));
    expect(presence).toEqual({ present: false, value: null });
  });

  it("renders fresh object values without looping and retains the latest committed content", async () => {
    const host = document.createElement("div");
    await act(() => root.unmount());
    root = createRoot(host);
    function ObjectPresenceProbe({ open, title }: { open: boolean; title: string }) {
      const panel = usePanelPresence(open, { title }, true, "thread-one", 180);
      return panel.present ? <span>{panel.value?.title}</span> : null;
    }

    await act(() => root.render(<ObjectPresenceProbe open title="Initial panel" />));
    expect(host.textContent).toBe("Initial panel");
    await act(() => root.render(<ObjectPresenceProbe open title="Updated panel" />));
    expect(host.textContent).toBe("Updated panel");
    const openContent = host.firstChild;
    await act(() => root.render(<ObjectPresenceProbe open={false} title="Closed input" />));
    expect(host.textContent).toBe("Updated panel");
    expect(host.firstChild).toBe(openContent);
    await act(() => vi.advanceTimersByTime(180));
    expect(host.textContent).toBe("");
  });
});

async function paintPendingFrame() {
  const callback = pendingFrames.shift();
  await act(() => callback?.(0));
}

describe("usePanelNavigationSuppression", () => {
  it("suppresses initial and navigated panel state until each route has painted", async () => {
    await act(() => root.render(<SuppressionProbe navigationKey="/thread/one" />));
    expect(observed.at(-1)).toBe(true);

    await paintPendingFrame();
    expect(observed.at(-1)).toBe(true);
    await paintPendingFrame();
    expect(observed.at(-1)).toBe(false);

    await act(() => root.render(<SuppressionProbe navigationKey="/thread/two" />));
    expect(observed.at(-1)).toBe(true);

    await paintPendingFrame();
    expect(observed.at(-1)).toBe(true);
    await paintPendingFrame();
    expect(observed.at(-1)).toBe(false);
  });
});

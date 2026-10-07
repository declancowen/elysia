import { act, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { usePanelNavigationSuppression, usePanelPresence } from "./panelAnimations";

let renderer: ReactTestRenderer | null = null;
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
  vi.stubGlobal("window", {
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      pendingFrames.push(callback);
      return pendingFrames.length;
    }),
    cancelAnimationFrame: vi.fn(),
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
});

afterEach(async () => {
  await act(() => renderer?.unmount());
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
    presence = usePanelPresence(open, open ? "chat-one" : null, animated, scopeKey, 180);
    return null;
  }

  it("retains the closing chat for the transition and cancels removal when reopened", async () => {
    await act(() => {
      renderer = create(<PresenceProbe open />);
    });
    await act(() => renderer?.update(<PresenceProbe open={false} />));
    expect(presence).toEqual({ present: true, value: "chat-one" });
    await act(() => vi.advanceTimersByTime(90));
    await act(() => renderer?.update(<PresenceProbe open />));
    await act(() => vi.advanceTimersByTime(180));
    expect(presence).toEqual({ present: true, value: "chat-one" });
    await act(() => renderer?.update(<PresenceProbe open={false} />));
    await act(() => vi.advanceTimersByTime(180));
    expect(presence).toEqual({ present: false, value: null });
  });

  it("never retains a chat across document scopes or when motion is disabled", async () => {
    await act(() => {
      renderer = create(<PresenceProbe open />);
    });
    await act(() => renderer?.update(<PresenceProbe open={false} scopeKey="task-two" />));
    expect(presence).toEqual({ present: false, value: null });
    await act(() => renderer?.update(<PresenceProbe open />));
    await act(() => renderer?.update(<PresenceProbe open={false} animated={false} />));
    expect(presence).toEqual({ present: false, value: null });
    await act(() => renderer?.update(<PresenceProbe open={false} animated />));
    expect(presence).toEqual({ present: false, value: null });
  });
});

async function paintPendingFrame() {
  const callback = pendingFrames.shift();
  await act(() => callback?.(0));
}

describe("usePanelNavigationSuppression", () => {
  it("suppresses initial and navigated panel state until each route has painted", async () => {
    await act(() => {
      renderer = create(<SuppressionProbe navigationKey="/thread/one" />);
    });
    expect(observed.at(-1)).toBe(true);

    await paintPendingFrame();
    expect(observed.at(-1)).toBe(true);
    await paintPendingFrame();
    expect(observed.at(-1)).toBe(false);

    await act(() => {
      renderer?.update(<SuppressionProbe navigationKey="/thread/two" />);
    });
    expect(observed.at(-1)).toBe(true);

    await paintPendingFrame();
    expect(observed.at(-1)).toBe(true);
    await paintPendingFrame();
    expect(observed.at(-1)).toBe(false);
  });
});

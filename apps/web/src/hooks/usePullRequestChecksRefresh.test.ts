import { act } from "../../test/act";
import type { PullRequestCheck } from "@elysiatools/contracts";
import { createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vite-plus/test";

import { usePullRequestChecksRefresh } from "./usePullRequestChecksRefresh";

it.each(["pending", "action-required"] as const)(
  "polls quiet PRs each minute, speeds up for %s or missing checks, resumes from idle, and stops for closed PRs",
  async (pendingStatus) => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
    vi.stubGlobal("document", document);
    vi.stubGlobal("window", new EventTarget());

    const refresh = vi.fn();
    let renderer: ReactTestRenderer | undefined;
    function Probe({
      status = "success",
      enabled = true,
      busy = false,
    }: {
      status?: PullRequestCheck["status"] | null;
      enabled?: boolean;
      busy?: boolean;
    }) {
      usePullRequestChecksRefresh({
        refresh: busy ? null : refresh,
        enabled,
        key: `test-pr-checks:${pendingStatus}`,
        checks: status === null ? [] : [{ name: "CI", status, description: null, url: null }],
      });
      return null;
    }
    const update = async (props: Parameters<typeof Probe>[0]) => {
      await act(() => renderer?.update(createElement(Probe, props)));
    };
    const advance = async (ms: number) => await act(() => vi.advanceTimersByTime(ms));
    try {
      await act(() => {
        renderer = create(createElement(Probe));
      });
      await advance(59_999);
      expect(refresh).toHaveBeenCalledTimes(0);
      await advance(1);
      expect(refresh).toHaveBeenCalledTimes(1);
      await update({ status: pendingStatus });
      await advance(44_999);
      expect(refresh).toHaveBeenCalledTimes(1);
      await advance(1);
      expect(refresh).toHaveBeenCalledTimes(2);
      await update({ status: "failure" });
      await advance(60_000);
      expect(refresh).toHaveBeenCalledTimes(3);
      await update({ status: null });
      for (let tick = 0; tick < 3; tick++) {
        await advance(45_000);
        await update({ status: null });
      }
      expect(refresh).toHaveBeenCalledTimes(6);
      await advance(44_999);
      expect(refresh).toHaveBeenCalledTimes(6);
      await advance(1);
      expect(refresh).toHaveBeenCalledTimes(7);
      await advance(6 * 60_000);
      const beforeResume = refresh.mock.calls.length;
      await act(() => document.dispatchEvent(new Event("pointerdown")));
      expect(refresh).toHaveBeenCalledTimes(beforeResume + 1);
      document.visibilityState = "hidden";
      await act(() => document.dispatchEvent(new Event("visibilitychange")));
      await advance(60_000);
      expect(refresh).toHaveBeenCalledTimes(beforeResume + 1);
      document.visibilityState = "visible";
      await act(() => document.dispatchEvent(new Event("visibilitychange")));
      expect(refresh).toHaveBeenCalledTimes(beforeResume + 2);
      await update({ enabled: false });
      await advance(120_000);
      expect(refresh).toHaveBeenCalledTimes(beforeResume + 2);
    } finally {
      await act(() => renderer?.unmount());
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  },
);

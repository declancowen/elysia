import { describe, expect, it, vi } from "vite-plus/test";

import {
  createThreadNotificationGate,
  type ThreadNotificationObservation,
} from "./ThreadNotificationCoordinator.logic";

const working: ThreadNotificationObservation = {
  runId: "run-1",
  attention: null,
  settled: false,
  completedAt: null,
};
const completed = (at: number, runId = "run-1"): ThreadNotificationObservation => ({
  runId,
  attention: null,
  settled: true,
  completedAt: at,
});
const visible = { archived: false, quiet: false };

function harness() {
  const notify = vi.fn();
  const gate = createThreadNotificationGate<string>(notify);
  let prior: ThreadNotificationObservation | undefined;
  const observe = (next: ThreadNotificationObservation, options = visible) => {
    gate.observe("thread", prior, next, options);
    prior = next;
  };
  return { gate, notify, observe };
}

describe("createThreadNotificationGate", () => {
  it("notifies a completion immediately and only once", () => {
    const { notify, observe } = harness();
    observe(working);
    observe(completed(1));
    expect(notify.mock.calls).toEqual([["thread", "completion"]]);
    observe({ ...completed(1) });
    observe(working);
    observe(completed(1));
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("notifies each newer completion immediately", () => {
    const { notify, observe } = harness();
    observe(working);
    observe(completed(1));
    observe(working);
    observe(completed(2));
    expect(notify.mock.calls).toEqual([
      ["thread", "completion"],
      ["thread", "completion"],
    ]);
    observe(completed(1));
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("notifies attention once and still notifies the subsequent completion", () => {
    const { notify, observe } = harness();
    observe(working);
    const attention = {
      runId: "run-1",
      attention: "run-1:approval",
      settled: false,
      completedAt: null,
    };
    observe(attention);
    expect(notify.mock.calls).toEqual([["thread", "input"]]);
    observe({ ...attention });
    expect(notify).toHaveBeenCalledTimes(1);
    observe(working);
    observe(completed(1));
    expect(notify.mock.calls).toEqual([
      ["thread", "input"],
      ["thread", "completion"],
    ]);
  });

  it("does not replay a completion after attention resolves", () => {
    const { notify, observe } = harness();
    observe(working);
    observe(completed(1));
    observe({ runId: "run-1", attention: "run-1:limited", settled: false, completedAt: null });
    observe(completed(1));
    expect(notify.mock.calls).toEqual([
      ["thread", "completion"],
      ["thread", "input"],
    ]);
  });

  it("never notifies existing, archived or stopped completions, including when unarchived", () => {
    const { notify, observe } = harness();
    observe(completed(1));
    observe(working);
    observe(completed(2), { ...visible, quiet: true });
    observe(completed(2));
    observe(working);
    observe(completed(3), { ...visible, archived: true });
    observe(completed(3));
    expect(notify).not.toHaveBeenCalled();
    observe(working);
    observe(completed(4));
    expect(notify.mock.calls).toEqual([["thread", "completion"]]);
  });

  it("rebases a settled run's corrected timestamp on reconnect without replaying it", () => {
    const notify = vi.fn();
    const gate = createThreadNotificationGate<string>(notify);
    gate.observe("thread", undefined, completed(1), visible);
    gate.observe("thread", completed(1), completed(2), { ...visible, reconnecting: true });
    gate.observe("thread", working, completed(2), visible);
    expect(notify).not.toHaveBeenCalled();
    gate.observe("thread", working, completed(3, "run-2"), visible);
    expect(notify.mock.calls).toEqual([["thread", "completion"]]);
  });

  it.each([
    { prior: working, next: completed(1), kind: "completion" },
    { prior: completed(1), next: completed(2, "run-2"), kind: "completion" },
    { prior: working, next: { ...working, attention: "run-1:approval" }, kind: "input" },
  ])("preserves an offline $kind transition for $next.runId", ({ prior, next, kind }) => {
    const notify = vi.fn();
    const gate = createThreadNotificationGate<string>(notify);
    gate.observe("thread", undefined, prior, visible);
    gate.observe("thread", prior, next, { ...visible, reconnecting: true });
    gate.observe("thread", next, next, { ...visible, reconnecting: true });
    expect(notify.mock.calls).toEqual([["thread", kind]]);
  });

  it("forgets handled completions when a thread is removed or the gate is cleared", () => {
    for (const reset of [
      (gate: ReturnType<typeof createThreadNotificationGate<string>>) => gate.retain(new Set()),
      (gate: ReturnType<typeof createThreadNotificationGate<string>>) => gate.clear(),
    ]) {
      const { gate, notify, observe } = harness();
      observe(completed(1));
      reset(gate);
      gate.observe("thread", undefined, working, visible);
      gate.observe("thread", working, completed(1), visible);
      expect(notify.mock.calls).toEqual([["thread", "completion"]]);
    }
  });
});

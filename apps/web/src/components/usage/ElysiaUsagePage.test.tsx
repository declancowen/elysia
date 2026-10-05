import { RegistryContext } from "@effect/atom-react";
import { AtomRegistry } from "effect/unstable/reactivity";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { USAGE_CONTRACT_VERSION, UsageDay, type UsageSummary } from "@t3tools/contracts";
import type { ElysiaStatsSnapshot } from "@t3tools/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  load: vi.fn<() => Promise<ElysiaStatsSnapshot>>(),
  usage: vi.fn<() => Promise<UsageSummary>>(),
}));

vi.mock("../../state/server", async () => {
  const { Atom } = await import("effect/unstable/reactivity");
  const Effect = await import("effect/Effect");
  const query = Atom.make(Effect.promise(() => state.load()));
  const usage = Atom.make(Effect.promise(() => state.usage()));
  return {
    primaryServerProvidersAtom: Atom.make([
      { instanceId: "claudeAgent", driver: "claudeAgent", enabled: true },
    ]),
    serverEnvironment: { elysiaStats: () => query, usageSummary: () => usage },
  };
});
vi.mock("../../state/environments", () => ({ usePrimaryEnvironmentId: () => "local" }));
vi.mock("../../env", () => ({ isElectron: false }));
vi.mock("../../hooks/useNavigateBack", () => ({ useEscapeToGoBack: () => undefined }));
vi.mock("@tanstack/react-router", () => ({ Link: "a" }));
vi.mock("../Icons", () => ({ ElysiaIcon: () => null }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/sidebar", () => ({ SidebarInset: "div" }));
vi.mock("../WorkspacePageContainer", () => ({ WorkspacePageContainer: "main" }));
vi.mock("../WorkspacePageHeader", () => ({ WorkspacePageHeader: "header" }));

vi.mock("./UsageProviderChart", () => ({ UsageProviderChart: () => null }));
vi.mock("../ui/toggle-group", () => ({
  ToggleGroup: "toggle-group",
  ToggleGroupItem: "toggle-item",
}));
vi.mock("../ui/select", () => ({
  Select: "select-root",
  SelectTrigger: "select-trigger",
  SelectPopup: "select-popup",
  SelectGroup: "select-group",
  SelectItem: "select-item",
}));
vi.mock("../ui/tooltip", () => ({
  Tooltip: "tooltip",
  TooltipTrigger: ({ render }: { render: React.ReactNode }) => render,
  TooltipPopup: "tooltip-popup",
}));
vi.mock("../ui/input", () => ({ Input: "input" }));

import { ElysiaUsagePage } from "./ElysiaUsagePage";

let renderer: ReactTestRenderer | null;
let registry: AtomRegistry.AtomRegistry;
const available: ElysiaStatsSnapshot = {
  status: "available",
  session: { requests: 12, tokensSaved: 3400, savingsPercent: 25, savingsUsd: 0.17 },
  lifetime: { requests: 50, tokensSaved: 9900, savingsUsd: 1.25 },
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  registry = AtomRegistry.make();
  state.load.mockReset();
  state.load.mockResolvedValue(available);
  state.usage.mockReset();
  state.usage.mockResolvedValue({
    contractVersion: USAGE_CONTRACT_VERSION,
    readAt: "2026-10-04T12:00:00Z",
    timeZone: "UTC",
    sinceDay: UsageDay.make("1970-01-01"),
    untilDay: UsageDay.make("2026-10-04"),
    sources: [
      {
        fingerprint: {
          hostId: "local",
          provider: "claude",
          resolvedHomePath: "/isolated/projects",
          volumeId: "1",
        },
        status: "ok",
        scannedFiles: 1,
        skippedFiles: 0,
        malformedRecords: 0,
        distinctSessions: 1,
        message: null,
      },
    ],
    pricing: { status: "cached", source: "native", fetchedAt: null, knownModels: 1 },
    scanDurationMs: 0,
    buckets: [
      {
        day: UsageDay.make("2026-10-03"),
        provider: "claude",
        model: "DeepSeek",
        costUsd: 12,
        cacheSavingsUsd: 0,
        records: 1,
        unpricedRecords: 0,
        sessions: 1,
        costSource: "providerReported",
        totals: {
          uncachedInputTokens: 10,
          cachedInputTokens: 0,
          cacheCreationTokens: 0,
          outputTokens: 5,
          reasoningTokens: 0,
        },
      },
      {
        day: UsageDay.make("2026-01-01"),
        provider: "claude",
        model: "GPT",
        costUsd: 8,
        cacheSavingsUsd: 0,
        records: 1,
        unpricedRecords: 0,
        sessions: 1,
        costSource: "providerReported",
        totals: {
          uncachedInputTokens: 10,
          cachedInputTokens: 0,
          cacheCreationTokens: 0,
          outputTokens: 5,
          reasoningTokens: 0,
        },
      },
    ],
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = null;
  registry.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const mount = async () => {
  await act(async () => {
    renderer = create(
      <RegistryContext.Provider value={registry}>
        <ElysiaUsagePage />
      </RegistryContext.Provider>,
    );
  });
};
const displayedValues = () =>
  renderer!.root.findAllByType("dd").map((node) => node.children.join(""));
const statusText = () =>
  renderer!.root.findAllByProps({ role: "status" }).map((node) => node.children.join(""));
const changeScope = async (scope: string) => {
  await act(async () =>
    renderer!.root.findByProps({ "aria-label": "Statistics scope" }).props.onValueChange([scope]),
  );
};
it("loads when opened and refreshes only on request", async () => {
  await mount();
  expect(state.load).toHaveBeenCalledTimes(1);
  expect(state.usage).toHaveBeenCalledTimes(1);
  expect(
    renderer!.root.findAllByType("button").some((node) => node.children.includes("Refresh")),
  ).toBe(true);
  const reads = state.load.mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  expect(state.load.mock.calls.length).toBe(reads);
  await act(async () =>
    renderer!.root
      .findAllByType("button")
      .find((node) => node.children.includes("Refresh"))!
      .props.onClick(),
  );
  expect(state.load.mock.calls.length).toBeGreaterThan(reads);
});
it("uses dated usage for range totals, lifetime and the calendar monthly target", async () => {
  await mount();
  expect(displayedValues()).toContain("$12.00");
  expect(displayedValues()).not.toContain("$20.00");
  expect(renderer!.root.findByProps({ role: "meter" }).props["aria-valuenow"]).toBe(12);
  await changeScope("lifetime");
  expect(displayedValues()).toContain("$20.00");
  expect(displayedValues()).toContain("9,900");
  expect(renderer!.root.findByProps({ role: "meter" }).props["aria-valuenow"]).toBe(12);
});
it("labels the API month naturally and resets its pace and cost at the next month", async () => {
  await mount();
  expect(JSON.stringify(renderer!.toJSON())).toContain("October 2026");
  expect(JSON.stringify(renderer!.toJSON())).not.toContain("Calendar month");
  const marker = () =>
    renderer!.root.findAllByType("span").find((node) => node.props.style?.left !== undefined)!;
  expect(Number.parseFloat(marker().props.style.left)).toBeGreaterThan(10);
  expect(Number.parseFloat(marker().props.style.left)).toBeLessThan(15);
  vi.setSystemTime(new Date(2026, 10, 1));
  await changeScope("lifetime");
  expect(JSON.stringify(renderer!.toJSON())).toContain("November 2026");
  expect(renderer!.root.findByProps({ role: "meter" }).props["aria-valuenow"]).toBe(0);
  expect(marker().props.style.left).toBe("0%");
});
it("keeps usage readable when compression is unavailable and recovers on Refresh", async () => {
  state.load.mockResolvedValue({ status: "unavailable", reason: "compression-disabled" });
  await mount();
  expect(displayedValues()).toContain("$12.00");
  expect(statusText()).toContain("Compression is disabled in your Elysia CLI.");
  state.load.mockResolvedValue(available);
  await act(async () =>
    renderer!.root
      .findAllByType("button")
      .find((node) => node.children.includes("Refresh"))!
      .props.onClick(),
  );
  expect(displayedValues()).toContain("3,400");
});
it("does not present an unpriced model as zero-dollar usage", async () => {
  const summary = await state.usage();
  state.usage.mockResolvedValue({
    ...summary,
    buckets: summary.buckets.map((bucket) => ({
      ...bucket,
      costUsd: 0,
      unpricedRecords: bucket.records,
      costSource: "unpriced",
    })),
  });
  await mount();
  expect(displayedValues()).toContain("Unavailable");
  expect(displayedValues()).toContain("Unpriced");
  expect(statusText().some((text) => text.includes("no known price"))).toBe(true);
});

it("keeps a single API target above both metrics without subscription or share labels", async () => {
  await mount();
  await act(async () =>
    renderer!.root.findByProps({ "aria-label": "Chart metric" }).props.onValueChange(["tokens"]),
  );
  expect(displayedValues()).toContain("15");
  expect(renderer!.root.findAllByProps({ role: "meter" })).toHaveLength(1);
  const text = JSON.stringify(renderer!.toJSON());
  expect(text).toContain("Elysia");
  expect(text).not.toContain("100%");
  expect(text).not.toContain("Limits");
  expect(text).not.toContain("subscription");
});

it("distinguishes missing usage history from a disconnected compression proxy", async () => {
  const summary = await state.usage();
  state.usage.mockResolvedValue({
    ...summary,
    sources: summary.sources.map((source) => ({ ...source, status: "missing", scannedFiles: 0 })),
    buckets: [],
  });
  await mount();
  expect(displayedValues()).toContain("No usage yet");
  expect(displayedValues()).toContain("3,400");
  expect(JSON.stringify(renderer!.toJSON())).toContain("Start a chat, then refresh");
  expect(displayedValues()).not.toContain("Unavailable");
});

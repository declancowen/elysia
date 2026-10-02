import { RegistryContext } from "@effect/atom-react";
import { AtomRegistry } from "effect/unstable/reactivity";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import type { ElysiaStatsSnapshot } from "@t3tools/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({ load: vi.fn<() => Promise<ElysiaStatsSnapshot>>() }));

vi.mock("../../state/server", async () => {
  const { Atom } = await import("effect/unstable/reactivity");
  const Effect = await import("effect/Effect");
  const query = Atom.make(Effect.promise(() => state.load()));
  return {
    primaryServerProvidersAtom: Atom.make([
      { instanceId: "claudeAgent", driver: "claudeAgent", enabled: true },
    ]),
    serverEnvironment: { elysiaStats: () => query },
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
const refresh = async () => {
  await act(async () => {
    renderer!.root
      .findAllByType("button")
      .find((node) => node.children.includes("Refresh"))!
      .props.onClick();
  });
};
const updatedAt = () => renderer!.root.findAllByType("time").map((node) => node.props.dateTime);

it("does not read compression stats on page mount or automatically retry", async () => {
  vi.useFakeTimers();
  state.load.mockResolvedValue({ status: "unavailable", reason: "proxy-unavailable" });
  await mount();
  expect(state.load).not.toHaveBeenCalled();
  expect(statusText()).toEqual(["Click Refresh to view your compression stats."]);
  expect(updatedAt()).toEqual([]);
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(state.load).not.toHaveBeenCalled();
  await refresh();
  expect(state.load).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(state.load).toHaveBeenCalledTimes(1);
});

it("shows native session and lifetime savings in the app instead of embedding a foreign dashboard", async () => {
  await mount();
  await refresh();
  expect(displayedValues()).toEqual(["12", "3,400", "$0.17", "25%", "50", "9,900", "$1.25"]);
  expect(renderer!.root.findAllByType("iframe")).toHaveLength(0);
  expect(renderer!.root.findAllByType("code")).toHaveLength(0);
});

it("recovers from an unavailable proxy on manual Refresh without leaving a blank screen", async () => {
  state.load.mockResolvedValueOnce({ status: "unavailable", reason: "proxy-unavailable" });
  await mount();
  await refresh();
  expect(statusText()).toEqual([
    "Compression stats are unavailable. Elysia starts the local proxy automatically. Try Refresh, or check setup in Providers.",
  ]);
  expect(displayedValues()).toEqual([]);
  await refresh();
  expect(statusText()).toEqual([]);
  expect(displayedValues()).toContain("3,400");
});

it("updates the timestamp only after a successful available response", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  await mount();
  await refresh();
  expect(updatedAt()).toEqual(["2026-10-02T12:00:00.000Z"]);
  vi.setSystemTime(new Date("2026-10-02T12:01:00Z"));
  state.load.mockResolvedValueOnce({ status: "unavailable", reason: "invalid-data" });
  await refresh();
  expect(updatedAt()).toEqual(["2026-10-02T12:00:00.000Z"]);
  vi.setSystemTime(new Date("2026-10-02T12:02:00Z"));
  state.load.mockRejectedValueOnce(new Error("Connection unavailable"));
  await refresh();
  expect(updatedAt()).toEqual(["2026-10-02T12:00:00.000Z"]);
  vi.setSystemTime(new Date("2026-10-02T12:03:00Z"));
  await refresh();
  expect(updatedAt()).toEqual(["2026-10-02T12:03:00.000Z"]);
});

it("requires explicit Refresh again after leaving and reopening Stats", async () => {
  await mount();
  await refresh();
  expect(state.load).toHaveBeenCalledTimes(1);
  await act(() => renderer?.unmount());
  renderer = null;
  await mount();
  expect(state.load).toHaveBeenCalledTimes(1);
  expect(displayedValues()).toEqual([]);
  await refresh();
  expect(state.load).toHaveBeenCalledTimes(2);
  expect(displayedValues()).toContain("3,400");
});

it("clears previous savings when the native proxy becomes unavailable after refresh", async () => {
  await mount();
  await refresh();
  state.load.mockResolvedValueOnce({ status: "unavailable", reason: "compression-disabled" });
  await refresh();
  expect(displayedValues()).toEqual([]);
  expect(statusText()).toEqual(["Compression is disabled in your Elysia CLI."]);
});

it("shows missing cost data as unavailable and keeps absent lifetime totals out of the page", async () => {
  state.load.mockResolvedValueOnce({
    ...available,
    session: { ...available.session, savingsUsd: null },
    lifetime: null,
  });
  await mount();
  await refresh();
  expect(displayedValues()).toEqual(["12", "3,400", "Unavailable", "25%"]);
  expect(renderer!.root.findAllByType("h2").map((node) => node.children.join(""))).toEqual([
    "Current session",
  ]);
});

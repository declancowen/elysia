// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ProviderDriverKind, ProviderInstanceId } from "@elysiatools/contracts";
import { expect, it, vi } from "vite-plus/test";

import { ProviderInstanceCard } from "./ProviderInstanceCard";

it("allows either native package to be checked and blocks duplicate checks while pending", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let checking = false;
  let checks = 0;
  const props = {
    instanceId: ProviderInstanceId.make("claudeAgent"),
    instance: { driver: ProviderDriverKind.make("claudeAgent"), enabled: true },
    driverOption: undefined,
    liveProvider: undefined,
    mode: "editor" as const,
    onUpdate: () => undefined,
    hiddenModels: [],
    favoriteModels: [],
    modelOrder: [],
    onHiddenModelsChange: () => undefined,
    onFavoriteModelsChange: () => undefined,
    onModelOrderChange: () => undefined,
    onCheckUpdates: () => {
      checks += 1;
      checking = true;
      render();
    },
  };
  const render = () =>
    root.render(<ProviderInstanceCard {...props} isCheckingUpdates={checking} />);
  const button = (label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

  try {
    await act(async () => render());
    expect(
      button("Check Claude Code for updates").closest("section")?.querySelector("h2")?.textContent,
    ).toBe("Claude Code");
    expect(
      button("Check Elysia CLI for updates").closest("section")?.querySelector("h2")?.textContent,
    ).toBe("Elysia CLI");
    await act(async () => button("Check Claude Code for updates").click());
    expect(checks).toBe(1);
    expect(button("Check Claude Code for updates").disabled).toBe(true);
    expect(button("Check Elysia CLI for updates").disabled).toBe(true);
    await act(async () => button("Check Elysia CLI for updates").click());
    expect(checks).toBe(1);

    checking = false;
    await act(async () => render());
    await act(async () => button("Check Elysia CLI for updates").click());
    expect(checks).toBe(2);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

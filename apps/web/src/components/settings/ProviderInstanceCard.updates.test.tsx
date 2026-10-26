// @vitest-environment jsdom
import { act, render } from "../../../test/render";
import { ProviderDriverKind, ProviderInstanceId } from "@elysiatools/contracts";
import { expect, it, vi } from "vite-plus/test";

import { ProviderInstanceCard } from "./ProviderInstanceCard";

it("allows either native package to be checked and blocks duplicate checks while pending", async () => {
  let checking = false;
  let checks = 0;
  const props = {
    instanceId: ProviderInstanceId.make("claudeAgent"),
    instance: { driver: ProviderDriverKind.make("claudeAgent"), enabled: true },
    driverOption: undefined,
    liveProvider: undefined,
    mode: "editor" as const,
    onUpdate: () => undefined,
    onToggleFavorite: () => undefined,
    hiddenModels: [],
    favoriteModels: [],
    modelOrder: [],
    onHiddenModelsChange: () => undefined,
    onFavoriteModelsChange: () => undefined,
    onModelOrderChange: () => undefined,
    onCheckUpdates: () => {
      checks += 1;
      checking = true;
      void screen.rerender(view());
    },
  };
  const view = () => <ProviderInstanceCard {...props} isCheckingUpdates={checking} />;
  const button = (label: string) =>
    screen.container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

  await using screen = await render(view(), { router: false });
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
  await screen.rerender(view());
  await act(async () => button("Check Elysia CLI for updates").click());
  expect(checks).toBe(2);
});

vi.mock("vite-plus/test/browser", () => ({
  page: { elementLocator: () => ({}) },
  utils: { getElementLocatorSelectors: () => ({}) },
}));

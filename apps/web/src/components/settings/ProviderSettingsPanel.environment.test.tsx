import type { ReactElement } from "react";
import {
  DEFAULT_UNIFIED_SETTINGS,
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type UnifiedSettings,
} from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { visitElements } from "../../test/reactElementTree";
import { reactHookHarness as hooks } from "../../test/reactHookHarness";

const atoms = vi.hoisted(() => ({
  providers: null as ReadonlyArray<ServerProvider> | null,
  providersAtom: Symbol("providers"),
  refreshProviders: Symbol("refreshProviders"),
  updateProvider: Symbol("updateProvider"),
}));

const commands = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateProvider: vi.fn(),
}));

const settingsState = vi.hoisted(() => ({
  value: null as UnifiedSettings | null,
  readEnvironmentIds: [] as EnvironmentId[],
  updateEnvironmentIds: [] as EnvironmentId[],
  updateSettings: vi.fn(),
  updateClientSettings: vi.fn(),
}));

const settingsSearchState = vi.hoisted(() => ({
  targetId: null as string | null,
  effects: [] as Array<() => void>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { reactHookHarness } = await import("../../test/reactHookHarness");
  return {
    ...actual,
    useCallback: reactHookHarness.useCallback,
    useEffect: (effect: () => void) => settingsSearchState.effects.push(effect),
    useMemo: reactHookHarness.useMemo,
    useRef: reactHookHarness.useRef,
    useState: reactHookHarness.useState,
  };
});

vi.mock("./settingsLayout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./settingsLayout")>();
  return {
    ...actual,
    useSettingsSearchTargetId: () => settingsSearchState.targetId,
  };
});

vi.mock("./SettingsScopeSentence", () => ({ SettingsScopeSentence: () => null }));
vi.mock("react/compiler-runtime", async () => {
  const { reactHookHarness } = await import("../../test/reactHookHarness");
  return { c: reactHookHarness.useMemoCache };
});

vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => atoms.providers,
}));

vi.mock("../../state/server", () => ({
  EMPTY_SERVER_PROVIDERS: [],
  serverEnvironment: {
    providersValueAtom: () => atoms.providersAtom,
    refreshProviders: atoms.refreshProviders,
    updateProvider: atoms.updateProvider,
  },
}));

vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (atom: symbol) =>
    atom === atoms.refreshProviders ? commands.refresh : commands.updateProvider,
}));

vi.mock("../../hooks/useSettings", () => ({
  useUpdateClientSettings: () => settingsState.updateClientSettings,
  useEnvironmentSettings: (environmentId: EnvironmentId) => {
    settingsState.readEnvironmentIds.push(environmentId);
    return settingsState.value;
  },
  useUpdateEnvironmentSettings: () => settingsState.updateSettings,
}));

vi.mock("../../environments/primary", () => ({
  usePrimarySessionState: () => ({ data: null, error: null, isPending: false, refresh: vi.fn() }),
}));

vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({ data: null, hasError: false, isPending: true }),
}));

import { EnvironmentProviderSettings } from "./ProviderSettingsPanel";

const environmentId = EnvironmentId.make("remote-device");
const elysiaId = ProviderInstanceId.make("claudeAgent");
const customId = ProviderInstanceId.make("elysia_work");

function provider(): ServerProvider {
  return {
    instanceId: elysiaId,
    driver: ProviderDriverKind.make("claudeAgent"),
    enabled: true,
    installed: true,
    version: "1.0.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-07-24T12:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    versionAdvisory: {
      status: "behind_latest",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      updateCommand: "elysia-code --update",
      canUpdate: true,
      checkedAt: "2026-07-24T12:00:00.000Z",
      message: "Update available.",
    },
  };
}

function renderPanel(options?: {
  readonly readOnly?: boolean;
  readonly targetInstanceId?: ProviderInstanceId;
}): ReactElement<Record<string, unknown>> {
  hooks.beginRender();
  return EnvironmentProviderSettings({
    environmentId,
    environmentLabel: "Remote device",
    ...(options?.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    ...(options?.targetInstanceId === undefined
      ? {}
      : { targetInstanceId: options.targetInstanceId }),
  }) as ReactElement<Record<string, unknown>>;
}

function isRefreshButton(element: ReactElement<Record<string, unknown>>): boolean {
  const children = element.props.children;
  return (
    Array.isArray(children) &&
    children.some(
      (child) =>
        typeof child === "object" &&
        child !== null &&
        (child as ReactElement<Record<string, unknown>>).props?.className === "sr-only" &&
        (child as ReactElement<Record<string, unknown>>).props?.children ===
          "Refresh provider status",
    )
  );
}

function isAddProviderButton(element: ReactElement<Record<string, unknown>>): boolean {
  return element.props["aria-label"] === "Add provider";
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("EnvironmentProviderSettings routing", () => {
  beforeEach(() => {
    hooks.reset();
    atoms.providers = null;
    settingsState.value = DEFAULT_UNIFIED_SETTINGS;
    settingsState.readEnvironmentIds = [];
    settingsState.updateEnvironmentIds = [];
    settingsState.updateSettings.mockReset();
    settingsState.updateClientSettings.mockReset();
    settingsSearchState.targetId = null;
    settingsSearchState.effects = [];
    commands.refresh.mockReset().mockResolvedValue({ _tag: "Success" });
    commands.updateProvider.mockReset().mockResolvedValue({ _tag: "Success" });
  });

  it("coalesces a nullable provider snapshot before rendering array-backed UI", () => {
    expect(() => renderPanel()).not.toThrow();
    expect(settingsState.readEnvironmentIds).toEqual([environmentId]);
  });

  it("routes refresh and provider update commands to the selected environment", async () => {
    atoms.providers = [provider()];
    const panel = renderPanel();
    const refreshButton = visitElements(panel, isRefreshButton);
    expect(refreshButton).not.toBeNull();
    (refreshButton?.props.onClick as (() => void) | undefined)?.();
    await flushPromises();

    expect(commands.refresh).toHaveBeenCalledWith({
      environmentId,
      input: { refreshModels: true },
    });

    const providerCard = visitElements(
      panel,
      (element) =>
        element.props.instanceId === elysiaId && typeof element.props.onRunUpdate === "function",
    );
    expect(providerCard).not.toBeNull();
    (providerCard?.props.onRunUpdate as (() => void) | undefined)?.();
    await flushPromises();

    expect(commands.updateProvider).toHaveBeenCalledWith({
      environmentId,
      input: { provider: ProviderDriverKind.make("claudeAgent"), instanceId: elysiaId },
    });
  });

  it("coalesces explicit native update checks until the current request completes", async () => {
    let finish!: (value: { _tag: "Success" }) => void;
    commands.refresh.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    atoms.providers = [provider()];
    const panel = renderPanel();
    const editor = visitElements(
      panel,
      (element) => element.props.instanceId === elysiaId && element.props.mode === "editor",
    );
    const check = editor?.props.onCheckUpdates as () => void;
    check();
    check();
    expect(commands.refresh).toHaveBeenCalledExactlyOnceWith({
      environmentId,
      input: { instanceId: elysiaId, fresh: true, refreshModels: true },
    });
    finish({ _tag: "Success" });
    await flushPromises();
    commands.refresh.mockResolvedValue({ _tag: "Success" });
    check();
    await flushPromises();
    expect(commands.refresh).toHaveBeenCalledTimes(2);
  });

  it("shows configured Elysia instances in the single-column editor", () => {
    settingsState.value = {
      ...DEFAULT_UNIFIED_SETTINGS,
      providerInstances: {
        [customId]: { driver: ProviderDriverKind.make("claudeAgent"), enabled: true },
      },
    };
    atoms.providers = [provider()];
    const panel = renderPanel({ targetInstanceId: customId });
    const editor = visitElements(
      panel,
      (element) => element.props.mode === "editor" && element.props.instanceId === customId,
    );
    expect(editor?.props.instanceId).toBe(customId);
  });

  it.each([
    ["onFavoriteModelsChange", { favorites: [{ provider: elysiaId, model: "chosen" }] }],
    [
      "onHiddenModelsChange",
      { providerModelPreferences: { [elysiaId]: { hiddenModels: ["chosen"], modelOrder: [] } } },
    ],
    [
      "onModelOrderChange",
      { providerModelPreferences: { [elysiaId]: { hiddenModels: [], modelOrder: ["chosen"] } } },
    ],
  ])("saves %s on this device without changing the selected server", (action, expected) => {
    atoms.providers = [provider()];
    const panel = renderPanel();
    const editor = visitElements(
      panel,
      (element) => element.props.instanceId === elysiaId && element.props.mode === "editor",
    );
    expect(editor).not.toBeNull();
    if (!editor) throw new Error("Provider editor was not rendered");
    (editor.props[action] as (models: string[]) => void)(["chosen"]);
    expect(settingsState.updateClientSettings).toHaveBeenCalledExactlyOnceWith(expected);
    expect(settingsState.updateSettings).not.toHaveBeenCalled();
  });

  it("does not recreate a removed instance while rendering remaining Elysia settings", () => {
    atoms.providers = [provider()];
    const panel = renderPanel({ targetInstanceId: customId });
    expect(visitElements(panel, (element) => element.props.instanceId === customId)).toBeNull();
    expect(settingsState.updateSettings).not.toHaveBeenCalled();
  });

  it("shows configured Elysia instances while write controls are read only", () => {
    settingsState.value = {
      ...DEFAULT_UNIFIED_SETTINGS,
      providerInstances: {
        [customId]: {
          driver: ProviderDriverKind.make("claudeAgent"),
          enabled: true,
        },
      },
    };
    atoms.providers = [provider()];
    const panel = renderPanel({ readOnly: true });

    const inertWrapper = visitElements(panel, (element) => element.props.inert === true);
    expect(inertWrapper).not.toBeNull();

    const customEditor = visitElements(
      panel,
      (element) => element.props.instanceId === customId && element.props.mode === "editor",
    );
    expect(customEditor?.props.readOnly).toBe(true);
    expect(customEditor?.props.onSelect).toBeUndefined();

    const notice = visitElements(panel, (element) => element.props.title === "Limited permissions");
    expect(notice).not.toBeNull();

    expect(visitElements(panel, isRefreshButton)).toBeNull();
    expect(visitElements(panel, isAddProviderButton)).toBeNull();
  });

  it("keeps the editable layout interactive when not read only", () => {
    atoms.providers = [provider()];
    const panel = renderPanel();
    expect(visitElements(panel, (element) => element.props.inert === true)).toBeNull();
    expect(
      visitElements(panel, (element) => element.props.title === "Limited permissions"),
    ).toBeNull();
    expect(visitElements(panel, isRefreshButton)).not.toBeNull();
    expect(visitElements(panel, isAddProviderButton)).toBeNull();
  });

  it("keeps Advanced visible when search targets the provider health interval", () => {
    let panel = renderPanel();
    expect(visitElements(panel, (element) => element.props.title === "Advanced")).not.toBeNull();
    expect(
      visitElements(panel, (element) => element.props.id === "provider-health-check-interval"),
    ).not.toBeNull();

    settingsSearchState.targetId = "provider-health-check-interval";
    panel = renderPanel();
    expect(visitElements(panel, (element) => element.props.title === "Advanced")).not.toBeNull();
    expect(
      visitElements(panel, (element) => element.props.id === "provider-health-check-interval"),
    ).not.toBeNull();
  });

  it("deletes and resets provider configuration without erasing shared preferences", () => {
    settingsState.value = {
      ...DEFAULT_UNIFIED_SETTINGS,
      providerInstances: {
        [elysiaId]: {
          driver: ProviderDriverKind.make("claudeAgent"),
          enabled: false,
        },
        [customId]: {
          driver: ProviderDriverKind.make("claudeAgent"),
          enabled: true,
        },
      },
      providerModelPreferences: {
        [customId]: { hiddenModels: ["hidden"], modelOrder: ["model"] },
      },
      favorites: [{ provider: customId, model: "favorite" }],
    };
    const panel = renderPanel();
    const customCard = visitElements(
      panel,
      (element) => element.props.instanceId === customId && element.props.mode === "editor",
    );
    expect(customCard).not.toBeNull();
    (customCard?.props.onDelete as (() => void) | undefined)?.();

    expect(settingsState.updateSettings).toHaveBeenLastCalledWith({
      providerInstances: {
        [elysiaId]: settingsState.value.providerInstances?.[elysiaId],
      },
    });

    settingsState.updateSettings.mockClear();
    const defaultCard = visitElements(
      panel,
      (element) => element.props.instanceId === elysiaId && element.props.mode === "editor",
    );
    const resetAction = defaultCard?.props.headerAction;
    const resetButton = visitElements(
      resetAction,
      (element) => typeof element.props.onClick === "function",
    );
    expect(resetButton).not.toBeNull();
    (resetButton?.props.onClick as (() => void) | undefined)?.();

    const resetPatch = settingsState.updateSettings.mock.lastCall?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(Object.keys(resetPatch ?? {}).sort()).toEqual(["providerInstances", "providers"]);
    expect(resetPatch).not.toHaveProperty("favorites");
    expect(resetPatch).not.toHaveProperty("providerModelPreferences");
  });
});

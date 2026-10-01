import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS, type UnifiedSettings } from "@t3tools/contracts/settings";
import { createModelSelection } from "@t3tools/shared/model";
import { describe, expect, it } from "vite-plus/test";

import {
  getAppModelOptionsForInstance,
  getCustomModelOptionsByInstance,
  resolveAppModelSelection,
  resolveAppModelSelectionForInstance,
  resolveAppModelSelectionState,
} from "./modelSelection";
import { providerModelKey, sortProviderModelItems } from "./modelOrdering";
import { deriveProviderInstanceEntries, NO_PROVIDER_MODEL_SELECTION } from "./providerInstances";

const elysiaId = ProviderInstanceId.make("claudeAgent");
const nativeModels: ServerProvider["models"] = [
  { slug: "claude-sonnet-5", name: "Claude Sonnet 5", isCustom: false, capabilities: {} },
  { slug: "kimi-k3", name: "Kimi K3", isDefault: true, isCustom: false, capabilities: {} },
  { slug: "gpt-5-4", name: "GPT 5.4", isCustom: false, capabilities: {} },
];

function provider(driver = "claudeAgent", enabled = true): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(driver),
    driver: ProviderDriverKind.make(driver),
    enabled,
    installed: true,
    version: "0.3.8",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-10-01T00:00:00.000Z",
    models:
      driver === "claudeAgent"
        ? nativeModels
        : [{ slug: `${driver}-stale-model`, name: "Old model", isCustom: false, capabilities: {} }],
    slashCommands: [],
    skills: [],
  };
}

function staleSettings(withInstance = true): UnifiedSettings {
  return {
    ...DEFAULT_UNIFIED_SETTINGS,
    providerInstances: withInstance
      ? {
          [elysiaId]: {
            driver: ProviderDriverKind.make("claudeAgent"),
            enabled: true,
            config: { customModels: ["removed/instance-model"] },
          },
        }
      : {},
    providers: {
      ...DEFAULT_UNIFIED_SETTINGS.providers,
      claudeAgent: {
        ...DEFAULT_UNIFIED_SETTINGS.providers.claudeAgent,
        customModels: ["removed/legacy-model"],
      },
    },
    favorites: [
      { provider: elysiaId, model: "removed/instance-model" },
      { provider: elysiaId, model: "removed/legacy-model" },
    ],
  };
}

describe("Elysia native model selection", () => {
  it.each([true, false])(
    "uses only the native catalog when instance configuration is present: %s",
    (withInstance) => {
      const nativeProvider = {
        ...provider(),
        models: [
          ...nativeModels,
          {
            slug: "removed/server-custom-model",
            name: "Old custom row",
            isCustom: true,
            capabilities: {},
          },
        ],
      };
      const entry = deriveProviderInstanceEntries([nativeProvider])[0]!;
      const options = getAppModelOptionsForInstance(
        staleSettings(withInstance),
        entry,
        "removed/instance-model",
      );

      expect(options.map(({ slug, name }) => ({ slug, name }))).toEqual(
        nativeModels.map(({ slug, name }) => ({ slug, name })),
      );
      expect(options.every((option) => !option.isCustom && !option.isUnavailable)).toBe(true);
    },
  );

  it("resolves stale selected models to the CLI default rather than the first or last custom row", () => {
    const settings = {
      ...staleSettings(),
      textGenerationModelSelection: createModelSelection(elysiaId, "removed/instance-model"),
      providerModelPreferences: {
        [elysiaId]: { hiddenModels: [], modelOrder: ["gpt-5-4", "claude-sonnet-5", "kimi-k3"] },
      },
    };
    const providers = [provider()];

    for (const selected of ["removed/instance-model", "removed/legacy-model", "unknown/model"]) {
      expect(
        resolveAppModelSelectionForInstance(elysiaId, settings, providers, selected, {
          preserveUnavailableSelection: true,
        }),
      ).toBe("kimi-k3");
      expect(
        resolveAppModelSelection(
          ProviderDriverKind.make("claudeAgent"),
          settings,
          providers,
          selected,
        ),
      ).toBe("kimi-k3");
    }
    expect(resolveAppModelSelectionState(settings, providers)).toMatchObject({
      instanceId: elysiaId,
      model: "kimi-k3",
    });
    expect(resolveAppModelSelectionForInstance(elysiaId, settings, providers, "gpt-5-4")).toBe(
      "gpt-5-4",
    );
  });

  it.each([false, true])(
    "excludes disabled provider drivers and their favorites even with a stale enabled snapshot: %s",
    (enabled) => {
      const oldProviders = ["codex", "cursor", "grok", "opencode", "antigravity"].map((driver) =>
        provider(driver, enabled),
      );
      const providers = [...oldProviders, provider()];
      const settings: UnifiedSettings = {
        ...staleSettings(),
        favorites: oldProviders.map((oldProvider) => ({
          provider: oldProvider.instanceId,
          model: oldProvider.models[0]!.slug,
        })),
        textGenerationModelSelection: createModelSelection(
          ProviderInstanceId.make("codex"),
          "codex-stale-model",
        ),
      };
      const options = getCustomModelOptionsByInstance(
        settings,
        providers,
        ProviderInstanceId.make("codex"),
        "codex-stale-model",
      );

      expect([...options.keys()]).toEqual([elysiaId]);
      expect(options.get(elysiaId)?.map((option) => option.slug)).toEqual(
        nativeModels.map((model) => model.slug),
      );
      expect(resolveAppModelSelectionState(settings, providers)).toMatchObject({
        instanceId: elysiaId,
        model: "kimi-k3",
      });
      expect(resolveAppModelSelectionState(settings, oldProviders)).toEqual(
        NO_PROVIDER_MODEL_SELECTION,
      );
      for (const oldProvider of oldProviders) {
        expect(
          resolveAppModelSelectionForInstance(
            oldProvider.instanceId,
            settings,
            providers,
            oldProvider.models[0]!.slug,
          ),
        ).toBeNull();
      }
    },
  );

  it("respects enabled models and native ordering while favorites move visible native models first", () => {
    const settings: UnifiedSettings = {
      ...staleSettings(),
      favorites: [
        { provider: elysiaId, model: "removed/instance-model" },
        { provider: ProviderInstanceId.make("codex"), model: "codex-stale-model" },
        { provider: elysiaId, model: "claude-sonnet-5" },
        { provider: elysiaId, model: "gpt-5-4" },
      ],
      providerModelPreferences: {
        [elysiaId]: {
          hiddenModels: ["gpt-5-4"],
          modelOrder: ["removed/instance-model", "kimi-k3", "gpt-5-4", "claude-sonnet-5"],
        },
      },
    };
    const providers = [provider(), provider("codex")];
    const options = getCustomModelOptionsByInstance(settings, providers).get(elysiaId)!;
    expect(options.map((option) => option.slug)).toEqual(["kimi-k3", "claude-sonnet-5"]);

    const favoriteModels = sortProviderModelItems(
      options.map((option) => ({ ...option, instanceId: elysiaId })),
      {
        favoriteModelKeys: settings.favorites.map(({ provider, model }) =>
          providerModelKey(provider, model),
        ),
        groupFavorites: true,
      },
    );
    expect(favoriteModels.map((option) => option.slug)).toEqual(["claude-sonnet-5", "kimi-k3"]);

    const enabledSettings: UnifiedSettings = {
      ...settings,
      providerModelPreferences: {
        [elysiaId]: { ...settings.providerModelPreferences[elysiaId]!, hiddenModels: [] },
      },
    };
    expect(
      getCustomModelOptionsByInstance(enabledSettings, providers)
        .get(elysiaId)
        ?.map((option) => option.slug),
    ).toEqual(["kimi-k3", "gpt-5-4", "claude-sonnet-5"]);
  });
});

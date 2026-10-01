import { isModelSelectionProviderEnabled } from "@t3tools/shared/serverSettings";
import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
  resolveProviderInstanceEnabled,
  isConnectionsHttpPath,
  isConnectionsRpcMethod,
  CONNECTIONS_ENABLED,
  UPSTREAM_ANALYTICS_ENABLED,
  type ServerProvider,
} from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { BUILT_IN_DRIVERS } from "./builtInDrivers.ts";
import { deriveProviderInstanceConfigMap } from "./Layers/ProviderInstanceRegistryHydration.ts";
import { elysiaModelCatalog, ELYSIA_MODELS, elysiaModelEnvironment } from "./ElysiaModelCatalog.ts";
import { BUNDLED_MODEL_MANIFEST } from "./ModelManifest.ts";
import { applyProviderCompatibility } from "./providerCompatibility.ts";

it("cannot register another runtime even when legacy or custom settings enable it", () => {
  const map = deriveProviderInstanceConfigMap({
    ...DEFAULT_SERVER_SETTINGS,
    providerInstances: {
      [ProviderInstanceId.make("codex_work")]: {
        driver: ProviderDriverKind.make("codex"),
        enabled: true,
        config: { enabled: true },
      },
      [ProviderInstanceId.make("custom_agent")]: {
        driver: ProviderDriverKind.make("customAgent"),
        enabled: true,
      },
    },
  });
  expect(
    isModelSelectionProviderEnabled(DEFAULT_SERVER_SETTINGS, {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-6-sol",
    }),
  ).toBe(false);
  expect(BUILT_IN_DRIVERS.map((driver) => driver.metadata.displayName)).toEqual(["Elysia"]);
  expect(Object.values(map).map((instance) => instance.driver)).toEqual(["claudeAgent"]);
  for (const driver of ["codex", "cursor", "grok", "opencode", "antigravity", "customAgent"])
    expect(
      resolveProviderInstanceEnabled({
        driver: ProviderDriverKind.make(driver),
        enabled: true,
        config: { enabled: true },
      }),
    ).toBe(false);
});

it("offers gateway models with opaque dispatch IDs and supported intelligence levels", () => {
  const catalog = elysiaModelCatalog(ELYSIA_MODELS);
  expect(catalog.models.map((entry) => entry.model.slug)).toEqual(ELYSIA_MODELS);
  expect(
    catalog.models.filter((entry) => entry.model.isDefault).map((entry) => entry.model.slug),
  ).toEqual(["deepseek-v4.1-flash"]);
  expect(catalog.models.every((entry) => entry.model.isCustom === false)).toBe(true);
  expect(
    catalog.models.every(
      (entry) =>
        !entry.model.capabilities?.optionDescriptors?.some(
          (option) => option.id === "contextWindow",
        ),
    ),
  ).toBe(true);
  expect(catalog.models.find((entry) => entry.model.slug === "kimi-k3")?.model.name).toBe(
    "Kimi K3",
  );
  const gpt = catalog.models.find((entry) => entry.model.slug === "gpt-5-4")!;
  expect(gpt.model.capabilities?.optionDescriptors?.[0]).toMatchObject({
    id: "effort",
    label: "Intelligence",
    options: [{ id: "low" }, { id: "medium" }, { id: "high" }, { id: "xhigh" }],
  });
  expect(elysiaModelEnvironment({}, gpt.model.slug)).toMatchObject({
    ANTHROPIC_CUSTOM_MODEL_OPTION: "gpt-5-4",
    ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES: "effort,xhigh_effort",
  });
});

it("blocks connection management while allowing the app's authenticated session", () => {
  expect(CONNECTIONS_ENABLED).toBe(false);
  expect(UPSTREAM_ANALYTICS_ENABLED).toBe(false);
  expect(isConnectionsRpcMethod("cloud.installRelayClient")).toBe(true);
  expect(isConnectionsHttpPath("/api/connect/link-proof")).toBe(true);
  expect(isConnectionsHttpPath("/api/auth/pairing-token")).toBe(true);
  expect(isConnectionsHttpPath("/api/auth/browser-session")).toBe(false);
  expect(isConnectionsRpcMethod("orchestration.dispatchCommand")).toBe(false);
});

it("synchronizes the app default with the native CLI configuration", () => {
  const map = deriveProviderInstanceConfigMap({
    ...DEFAULT_SERVER_SETTINGS,
    defaultModelSelection: { instanceId: ProviderInstanceId.make("claudeAgent"), model: "kimi-k3" },
  });
  expect(map[ProviderInstanceId.make("claudeAgent")]?.config).toMatchObject({
    elysiaDefaultModel: "kimi-k3",
  });
});

it("preserves native Claude compatibility independently of the Elysia app and CLI versions", () => {
  const provider: ServerProvider = {
    driver: ProviderDriverKind.make("claudeAgent"),
    instanceId: ProviderInstanceId.make("claudeAgent"),
    enabled: true,
    installed: true,
    status: "ready",
    auth: { status: "authenticated" },
    version: "0.3.8",
    runtimeVersion: "2.1.286",
    checkedAt: "2026-10-01T00:00:00Z",
    models: [],
    skills: [],
    slashCommands: [],
  };
  expect(
    applyProviderCompatibility(provider, undefined, BUNDLED_MODEL_MANIFEST.compatibility)
      .compatibilityAdvisory?.status,
  ).toBe("supported");
  expect(
    applyProviderCompatibility(
      { ...provider, runtimeVersion: "2.1.110" },
      undefined,
      BUNDLED_MODEL_MANIFEST.compatibility,
    ).compatibilityAdvisory?.status,
  ).toBe("unsupported");
});

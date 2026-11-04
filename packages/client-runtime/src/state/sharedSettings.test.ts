import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@elysiatools/contracts";
import { describe, expect, it } from "@effect/vitest";
import { beforeEach, vi } from "vite-plus/test";

// Retain upstream provider-sync fixtures without changing the production fork policy.
const forkPolicy = vi.hoisted(() => ({ elysia: false }));
vi.mock("../../../contracts/src/forkPolicy.ts", async (importOriginal) => ({
  ...(await importOriginal<
    Pick<typeof import("@elysiatools/contracts"), "isEnabledProviderDriver">
  >()),
  isEnabledProviderDriver: (driver: string) => !forkPolicy.elysia || driver === "claudeAgent",
}));
beforeEach(() => {
  forkPolicy.elysia = false;
});

import { filterSharedServerPatch } from "./sharedSettings.ts";

describe("filterSharedServerPatch", () => {
  it("keeps disabled upstream providers out of Elysia sync while sharing its native model", () => {
    forkPolicy.elysia = true;
    const codexSelection = {
      instanceId: ProviderInstanceId.make("codex_personal"),
      model: "gpt-5.6-luna",
    };
    const settings = {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        codex_personal: { driver: ProviderDriverKind.make("codex"), enabled: true, config: {} },
        claudeAgent: { driver: ProviderDriverKind.make("claudeAgent"), enabled: true, config: {} },
      },
      textGenerationModelSelection: codexSelection,
    };
    expect(
      filterSharedServerPatch(
        { sidebarAutoSettleAfterDays: 7, textGenerationModelSelection: codexSelection },
        settings,
      ),
    ).toEqual({ sidebarAutoSettleAfterDays: 7 });
    const nativeSelection = {
      instanceId: ProviderInstanceId.make("claudeAgent"),
      model: "native-model",
    };
    expect(
      filterSharedServerPatch({ textGenerationModelSelection: nativeSelection }, settings),
    ).toEqual({ textGenerationModelSelection: nativeSelection });
  });
  it("holds the restart preference until the target's config loads", () => {
    const patch = { continueThreadsAfterServerUpdate: true, sidebarAutoSettleAfterDays: 7 };
    expect(filterSharedServerPatch(patch, undefined)).toEqual({ sidebarAutoSettleAfterDays: 7 });
    expect(filterSharedServerPatch(patch, DEFAULT_SERVER_SETTINGS)).toEqual(patch);
  });

  it.each([true, false])(
    "resets a disabled default provider only on the originating environment (%s)",
    (targetIsSource) => {
      const settings = {
        ...DEFAULT_SERVER_SETTINGS,
        providerInstances: {
          codex: { driver: ProviderDriverKind.make("codex"), enabled: false, config: {} },
          claudeAgent: {
            driver: ProviderDriverKind.make("claudeAgent"),
            enabled: true,
            config: {},
          },
        },
        textGenerationModelSelection: {
          instanceId: ProviderInstanceId.make("claudeAgent"),
          model: "claude-opus-4-6",
        },
      };
      const patch = {
        textGenerationModelSelection: DEFAULT_SERVER_SETTINGS.textGenerationModelSelection,
        continueThreadsAfterServerUpdate: true,
        sidebarAutoSettleAfterDays: 7,
      };
      expect(filterSharedServerPatch(patch, settings, settings, targetIsSource)).toEqual({
        ...(targetIsSource
          ? { textGenerationModelSelection: DEFAULT_SERVER_SETTINGS.textGenerationModelSelection }
          : {}),
        continueThreadsAfterServerUpdate: true,
        sidebarAutoSettleAfterDays: 7,
      });
    },
  );

  it.each(["missing", "disabled", "different-driver", "enabled"] as const)(
    "shares a custom model only when its target provider is enabled (%s)",
    (availability) => {
      const instanceId = ProviderInstanceId.make("codex_personal");
      const selection = {
        instanceId,
        model: "gpt-5.6-luna",
        options: [{ id: "reasoningEffort", value: "low" }],
      };
      const instance = {
        driver: ProviderDriverKind.make(
          availability === "different-driver" ? "claudeAgent" : "codex",
        ),
        enabled: availability !== "disabled",
        config: {},
      };
      const settings = {
        ...DEFAULT_SERVER_SETTINGS,
        providerInstances: availability === "missing" ? {} : { [instanceId]: instance },
      };
      const patch = { sidebarAutoSettleAfterDays: 7, textGenerationModelSelection: selection };
      const sourceSettings = {
        ...settings,
        providerInstances: {
          [instanceId]: { ...instance, driver: ProviderDriverKind.make("codex"), enabled: true },
        },
      };
      expect(filterSharedServerPatch(patch, settings, sourceSettings)).toEqual(
        availability === "enabled" ? patch : { sidebarAutoSettleAfterDays: 7 },
      );
    },
  );
});

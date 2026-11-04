import {
  DEFAULT_SERVER_SETTINGS,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  isEnabledProviderDriver,
  type ServerConfig,
} from "@elysiatools/contracts";
import { expect, it } from "vite-plus/test";

import {
  buildModelOptions,
  describeUnavailableModelSelection,
  isModelSelectionUnavailable,
  resolveDefaultableModelSelection,
  resolveSelectableModelSelection,
} from "./modelOptions";

// This fixture deliberately imports the shipped fork policy without mocks.
it("keeps dormant Antigravity unavailable despite an explicit project enablement override", () => {
  const instanceId = ProviderInstanceId.make("antigravity_work");
  const projectId = ProjectId.make("project");
  const selection = { instanceId, model: "gemini" };
  const config = {
    providers: [
      {
        instanceId,
        driver: "antigravity",
        enabled: false,
        installed: true,
        auth: { status: "authenticated" },
        availability: "available",
        models: [{ slug: selection.model }],
      },
    ],
    settings: {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [instanceId]: { driver: ProviderDriverKind.make("antigravity"), enabled: false },
      },
      projectSettingsOverrides: {
        [projectId]: { providerInstances: { [instanceId]: { enabled: true } } },
      },
    },
  } as unknown as ServerConfig;

  expect(isEnabledProviderDriver("antigravity")).toBe(false);
  expect(isModelSelectionUnavailable(config, selection, projectId)).toBe(true);
});

it.each(["claude-sonnet-5", "claude-haiku-4-5", "removed-model"])(
  "keeps retired native model %s visible without allowing a turn or implicit default",
  (model) => {
    const instanceId = ProviderInstanceId.make("claudeAgent");
    const selection = { instanceId, model };
    const config = {
      providers: [
        {
          instanceId,
          driver: "claudeAgent",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          models: [
            {
              slug: "claude-sonnet-5-5",
              name: "Claude Sonnet 5.5",
              isCustom: false,
              capabilities: null,
            },
            { slug: "gpt-6.1-sol", name: "GPT-6.1 Sol", isCustom: false, capabilities: null },
          ],
        },
      ],
      settings: {
        ...DEFAULT_SERVER_SETTINGS,
        providerInstances: {
          [instanceId]: { driver: ProviderDriverKind.make("claudeAgent"), enabled: true },
        },
      },
    } as unknown as ServerConfig;
    expect(isModelSelectionUnavailable(config, selection, null)).toBe(true);
    expect(resolveSelectableModelSelection(config, selection, null)).toBeNull();
    expect(resolveDefaultableModelSelection(config, selection, null)).toBeNull();
    const options = buildModelOptions(config, selection, undefined, null);
    expect(options.find((option) => option.selection.model === model)).toMatchObject({
      label: model,
      isUnavailable: true,
    });
    expect(
      options.filter((option) => !option.isUnavailable).map((option) => option.selection.model),
    ).toEqual(["claude-sonnet-5-5", "gpt-6.1-sol"]);
    expect(describeUnavailableModelSelection(config, selection, null).title).toBe(
      "Model unavailable",
    );
    const current = { instanceId, model: "gpt-6.1-sol" };
    expect(isModelSelectionUnavailable(config, current, null)).toBe(false);
    expect(resolveSelectableModelSelection(config, current, null)).toBe(current);
  },
);

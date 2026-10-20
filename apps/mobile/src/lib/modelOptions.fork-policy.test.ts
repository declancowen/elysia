import {
  DEFAULT_SERVER_SETTINGS,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  isEnabledProviderDriver,
  type ServerConfig,
} from "@elysiatools/contracts";
import { expect, it } from "vite-plus/test";

import { isModelSelectionUnavailable } from "./modelOptions";

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

import { beforeEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProviderInstanceId } from "@elysiatools/contracts";

const mocks = vi.hoisted(() => ({
  connectionsEnabled: false,
  environmentId: "",
  projectsReady: true,
  projects: [] as Array<{ environmentId: string; agentProfile?: object }>,
  clientSettings: { onboardingCompletedAt: null as string | null },
  settings: {
    defaultModelSelection: { instanceId: "claudeAgent", model: "elysia-default" },
    enableAgentBrowserAccess: false,
  },
  hydrate: vi.fn(),
  persist: vi.fn(),
  createAgent: vi.fn(),
}));
vi.mock("@elysiatools/contracts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@elysiatools/contracts")>()),
  get CONNECTIONS_ENABLED() {
    return mocks.connectionsEnabled;
  },
}));
vi.mock("../hooks/useSettings", () => ({
  ensureClientSettingsHydrated: mocks.hydrate,
  getClientSettings: () => mocks.clientSettings,
  persistClientSettingsUpdate: mocks.persist,
}));
vi.mock("../providerInstances", () => ({
  resolveDefaultProviderModelSelection: (_providers: unknown, model: unknown) => model,
}));
vi.mock("../state/entities", () => ({
  readProjects: () => mocks.projects,
}));
vi.mock("../state/primaryEnvironment", () => ({ primaryEnvironmentIdAtom: "environment" }));
vi.mock("../state/shell", () => ({ allEnvironmentProjectSnapshotsReadyAtom: "projects-ready" }));
vi.mock("../rpc/atomRegistry", () => ({
  appAtomRegistry: {
    get: (atom: string) =>
      atom === "environment"
        ? mocks.environmentId
        : atom === "settings"
          ? mocks.settings
          : atom === "projects-ready"
            ? mocks.projectsReady
            : [],
  },
}));
vi.mock("../state/projects", () => ({ projectEnvironment: { createAgent: "create-agent" } }));
vi.mock("../state/server", () => ({
  primaryServerSettingsAtom: "settings",
  primaryServerProvidersAtom: "providers",
}));
vi.mock("@elysiatools/client-runtime/state/runtime", () => ({
  runAtomCommand: (_registry: unknown, _command: unknown, value: unknown) =>
    mocks.createAgent(value),
  squashAtomCommandFailure: (result: { cause: unknown }) => result.cause,
}));

import { completeOnboarding as complete } from "./firstRun";

let environmentNumber = 0;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.connectionsEnabled = false;
  mocks.environmentId = `onboarding-${++environmentNumber}`;
  mocks.projectsReady = true;
  mocks.projects = [];
  mocks.clientSettings.onboardingCompletedAt = null;
  mocks.hydrate.mockResolvedValue(undefined);
  mocks.persist.mockImplementation(
    (update: (current: typeof mocks.clientSettings) => typeof mocks.clientSettings) => {
      mocks.clientSettings = update(mocks.clientSettings);
      return Promise.resolve();
    },
  );
  mocks.createAgent.mockResolvedValue({
    _tag: "Success",
    value: { projectId: "agent", threadId: "thread" },
  });
});

it("creates the starter with native defaults before saving completion", async () => {
  await complete();
  expect(mocks.createAgent).toHaveBeenCalledWith({
    environmentId: EnvironmentId.make(mocks.environmentId),
    input: {
      name: "Your First Agent",
      agentProfile: {
        title: "General assistant",
        instructions:
          "Help me with everyday questions, planning, writing, and project tasks. Keep replies clear and concise. Ask for clarification when needed, and take practical steps to complete requests.",
        avatar: { preset: "square", color: "#28B4FF" },
        notificationsEnabled: true,
        archived: false,
      },
      defaultModelSelection: {
        instanceId: ProviderInstanceId.make("claudeAgent"),
        model: "elysia-default",
      },
      enableAgentBrowserAccess: false,
    },
  });
  expect(mocks.persist.mock.invocationCallOrder[0]).toBeGreaterThan(
    mocks.createAgent.mock.invocationCallOrder[0]!,
  );
  expect(mocks.clientSettings.onboardingCompletedAt).not.toBeNull();
});

it("shares concurrent gate and wizard creation and keeps it across a completion-save retry", async () => {
  let resolveCreation!: (value: unknown) => void;
  mocks.createAgent.mockReturnValue(
    new Promise((resolve) => {
      resolveCreation = resolve;
    }),
  );
  mocks.persist.mockRejectedValueOnce(new Error("storage unavailable"));
  const first = complete();
  const second = complete();
  const outcomes = Promise.allSettled([first, second]);
  await Promise.resolve();
  expect(mocks.createAgent).toHaveBeenCalledOnce();
  resolveCreation({ _tag: "Success", value: { projectId: "agent", threadId: "thread" } });
  await outcomes;
  mocks.clientSettings.onboardingCompletedAt = null;
  await complete();
  expect(mocks.createAgent).toHaveBeenCalledOnce();
});

it("leaves onboarding unfinished after a creation failure and retries", async () => {
  mocks.createAgent.mockResolvedValueOnce({ _tag: "Failure", cause: new Error("creation failed") });
  await expect(complete()).rejects.toThrow("creation failed");
  expect(mocks.persist).not.toHaveBeenCalled();
  await complete();
  expect(mocks.createAgent).toHaveBeenCalledTimes(2);
});

it.each(["completed", "existing-agent", "upstream"])(
  "preserves %s without creating a starter",
  async (scenario) => {
    if (scenario === "completed")
      mocks.clientSettings.onboardingCompletedAt = "2026-10-01T00:00:00Z";
    if (scenario === "existing-agent")
      mocks.projects = [{ environmentId: mocks.environmentId, agentProfile: { archived: true } }];
    if (scenario === "upstream") mocks.connectionsEnabled = true;
    await complete();
    expect(mocks.createAgent).not.toHaveBeenCalled();
    expect(mocks.persist).toHaveBeenCalledOnce();
  },
);

it("waits for authoritative projects before creating or completing onboarding", async () => {
  mocks.projectsReady = false;
  await expect(complete()).rejects.toThrow("workspace is still loading");
  expect(mocks.createAgent).not.toHaveBeenCalled();
  expect(mocks.persist).not.toHaveBeenCalled();
});

it("reads the current native defaults at completion time", async () => {
  const previous = mocks.settings.defaultModelSelection;
  mocks.settings.defaultModelSelection = { instanceId: "claudeAgent", model: "new-native-default" };
  try {
    await complete();
    expect(mocks.createAgent.mock.calls[0]?.[0].input.defaultModelSelection.model).toBe(
      "new-native-default",
    );
  } finally {
    mocks.settings.defaultModelSelection = previous;
  }
});

import { act } from "../../test/act";
import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@elysiatools/contracts";
import { AsyncResult } from "effect/reactivity";

import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  providers: [] as ServerProvider[],
  update: vi.fn(),
}));
vi.mock("~/state/environments", () => ({
  useEnvironments: () => ({
    environments: [
      {
        environmentId: EnvironmentId.make("local"),
        label: "Work machine",
        connection: { phase: "connected" },
      },
    ],
  }),
  useEnvironmentProviders: () => new Map([[EnvironmentId.make("local"), state.providers]]),
}));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => state.update }));
vi.mock("~/state/server", () => ({ serverEnvironment: { updateProvider: {} } }));

import { useProviderUpdates } from "./ProviderUpdatesAction";
import {
  getProviderUpdateRunOutcome,
  providerUpdateTargetName,
} from "./ProviderUpdateLaunchNotification.logic";
import { describeUpdateEverything } from "./sidebar/updateEverything.logic";

const checkedAt = "2026-10-20T00:00:00Z";
function nativeProvider(): ServerProvider {
  const advisory = {
    status: "behind_latest" as const,
    currentVersion: "1.0.0",
    latestVersion: "1.1.0",
    canUpdate: true,
    updateCommand: "native-update",
    checkedAt,
    message: "Update available.",
  };
  return {
    instanceId: ProviderInstanceId.make("elysia"),
    driver: ProviderDriverKind.make("claudeAgent"),
    displayName: "Elysia",
    enabled: true,
    installed: true,
    version: "1.0.0",
    runtimeVersion: "2.0.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt,
    models: [],
    slashCommands: [],
    skills: [],
    versionAdvisory: advisory,
    runtimeVersionAdvisory: {
      ...advisory,
      currentVersion: "2.0.0",
      latestVersion: "2.1.0",
      updateCommand: "runtime-update",
    },
  };
}
function UpdateHarness() {
  const updates = useProviderUpdates();
  const plan = describeUpdateEverything({
    localVersion: null,
    servers: [],
    providerMachines: updates.machines.map((machine) => ({
      environmentId: machine.environmentId,
      label: machine.label,
      providers: machine.candidates.map(providerUpdateTargetName),
    })),
  });
  return (
    <>
      <p>
        {plan.summary}
        {plan.lines.join("\n")}
      </p>
      <button onClick={() => updates.updateAll({ quiet: true })}>Update</button>
    </>
  );
}
let renderer: ReactTestRenderer | null = null;
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("confirms distinct CLI updates and dispatches each native update target", async () => {
  const provider = nativeProvider();
  state.providers = [provider];
  const succeeded = {
    status: "succeeded" as const,
    startedAt: checkedAt,
    finishedAt: checkedAt,
    message: "Updated",
    output: null,
  };
  state.update.mockResolvedValue(
    AsyncResult.success({
      providers: [{ ...provider, updateState: succeeded, runtimeUpdateState: succeeded }],
    }),
  );
  await act(async () => {
    renderer = create(<UpdateHarness />);
  });
  expect(renderer!.root.findByType("p").children.join("")).toBe(
    "Update 2 providersWork machine: Elysia CLI, Claude CLI",
  );
  await act(async () => renderer!.root.findByType("button").props.onClick());
  expect(state.update.mock.calls.map(([request]) => request)).toEqual([
    { environmentId: "local", input: { provider: "claudeAgent", instanceId: "elysia" } },
    {
      environmentId: "local",
      input: { provider: "claudeAgent", instanceId: "elysia", updateTarget: "runtime" },
    },
  ]);
});

it("reads the runtime result separately from a successful native CLI update", () => {
  const provider = nativeProvider();
  expect(
    getProviderUpdateRunOutcome({
      environmentId: EnvironmentId.make("local"),
      machineLabel: "Work machine",
      driver: ProviderDriverKind.make("claudeAgent"),
      instanceId: provider.instanceId,
      updateTarget: "runtime",
      result: AsyncResult.success({
        providers: [
          {
            ...provider,
            updateState: {
              status: "succeeded",
              startedAt: checkedAt,
              finishedAt: checkedAt,
              message: "Native updated",
              output: null,
            },
            runtimeUpdateState: {
              status: "failed",
              startedAt: checkedAt,
              finishedAt: checkedAt,
              message: "Runtime failed",
              output: null,
            },
          },
        ],
      }),
    }),
  ).toEqual({ status: "failed", line: "Work machine · Claude CLI: Runtime failed" });
});

import { RegistryContext } from "@effect/atom-react";
import {
  CONNECTIONS_ENABLED,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@elysiatools/contracts";
import type { Atom } from "effect/reactivity";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  providers: null as unknown as Atom.Writable<ReadonlyArray<ServerProvider>>,
  complete: vi.fn(),
  importThreads: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

// Keep the shipped fork policy. A ready native provider snapshot is the only
// authentication decision the wrapper consumes; setup itself belongs to the CLI.
vi.mock(import("../../state/server"), async (original) => {
  const actual = await original();
  const { Atom } = await import("effect/reactivity");
  state.providers = Atom.make<ReadonlyArray<ServerProvider>>([]);
  const config = Atom.make({});
  return {
    ...actual,
    primaryServerProvidersAtom: state.providers,
    serverEnvironment: {
      ...actual.serverEnvironment,
      providersValueAtom: (() => state.providers) as never,
      configValueAtom: (() => config) as never,
    },
  };
});
vi.mock(import("../../state/environments"), async (original) => {
  const environment = {
    environmentId: "test-env",
    label: "Computer",
    connection: { phase: "connected" },
    entry: { enabled: true },
  };
  return {
    ...(await original()),
    useEnvironments: (() => ({ environments: [environment] })) as never,
    usePrimaryEnvironment: (() => environment) as never,
  };
});
vi.mock(import("../../state/session"), async (original) => ({
  ...(await original()),
  useEnvironmentScope: () => true,
}));
vi.mock(import("../../state/entities"), async (original) => ({
  ...(await original()),
  useProjects: () => [],
  readProjects: () => [],
}));
vi.mock(import("../../onboarding/useProjectScans"), async (original) => ({
  ...(await original()),
  useProjectScans: () => [],
}));
vi.mock(import("../../state/use-atom-command"), async (original) => {
  const { agentSessionImport } = await import("../../state/agentSessions");
  return {
    ...(await original()),
    useAtomCommand: ((command: unknown) =>
      command === agentSessionImport ? state.importThreads : state.refresh) as never,
  };
});
vi.mock(import("../../onboarding/firstRun"), async (original) => ({
  ...(await original()),
  completeOnboarding: state.complete,
}));
vi.mock(import("../settings/ElysiaSetupSection"), async (original) => ({
  ...(await original()),
  ElysiaSetupSection: ({
    onContinue,
  }: Parameters<typeof import("../settings/ElysiaSetupSection").ElysiaSetupSection>[0]) => (
    <section aria-label="Elysia CLI setup">
      Installation · Sign in<button onClick={onContinue}>Continue</button>
    </section>
  ),
}));
vi.mock(import("../ui/toast"), async (original) => {
  const actual = await original();
  return { ...actual, toastManager: { ...actual.toastManager, add: state.toast } };
});

import { appAtomRegistry } from "../../rpc/atomRegistry";
import { WelcomeWizard } from "./WelcomeWizard";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  appAtomRegistry.set(state.providers, []);
  state.complete.mockResolvedValue(undefined);
  state.refresh.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(onDone: () => void) {
  expect(CONNECTIONS_ENABLED).toBe(false);
  await act(async () =>
    root.render(
      <RegistryContext.Provider value={appAtomRegistry}>
        <WelcomeWizard localAvailable onDone={onDone} />
      </RegistryContext.Provider>,
    ),
  );
  expect(document.querySelector('[aria-label="Elysia CLI setup"]')).not.toBeNull();
}
async function continueSetup() {
  const button = [...document.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === "Continue",
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

it("finishes Elysia authentication without opening project import", async () => {
  appAtomRegistry.set(state.providers, [
    {
      driver: ProviderDriverKind.make("claudeAgent"),
      instanceId: ProviderInstanceId.make("claudeAgent"),
      enabled: true,
      installed: true,
      version: null,
      status: "ready",
      auth: { status: "authenticated" },
      checkedAt: "2026-10-20T00:00:00Z",
      models: [],
      slashCommands: [],
      skills: [],
    },
  ]);
  const onDone = vi.fn();
  await render(onDone);
  expect(document.body.textContent).not.toContain("Projects");
  await continueSetup();
  expect(onDone).toHaveBeenCalledOnce();
  expect(state.complete).toHaveBeenCalledOnce();
  expect(state.importThreads).not.toHaveBeenCalled();
});

it("keeps Elysia setup open until the native CLI reports authentication", async () => {
  const onDone = vi.fn();
  await render(onDone);
  await continueSetup();
  expect(onDone).not.toHaveBeenCalled();
  expect(state.complete).not.toHaveBeenCalled();
  expect(state.toast).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Connect Elysia to continue" }),
  );
});

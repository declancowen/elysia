import { DEFAULT_UNIFIED_SETTINGS, EnvironmentId } from "@elysiatools/contracts";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

// Keep the real fork policy: additional provider accounts are unavailable in Elysia.
const state = vi.hoisted(() => ({ allowed: true, mutate: vi.fn() }));
vi.mock("@effect/atom-react", async (original) => ({
  ...(await original<typeof import("@effect/atom-react")>()),
  useAtomValue: (atom: string, select?: (value: null) => unknown) =>
    atom === "providers" ? [] : select ? select(null) : null,
}));
vi.mock("../../state/server", async (original) => ({
  ...(await original<typeof import("../../state/server")>()),
  EMPTY_SERVER_PROVIDERS: [],
  providersIgnoringCheckedAtAtom: () => "providers",
  serverEnvironment: {
    providersValueAtom: () => "providers",
    configValueAtom: () => "config",
    refreshProviders: "refresh",
    updateProvider: "update",
    uninstallAcpRegistryManagedBinary: "uninstall",
    acceptAcpRegistryUrlAuth: "accept",
  },
}));
vi.mock("../../state/use-atom-command", async (original) => ({
  ...(await original<typeof import("../../state/use-atom-command")>()),
  useAtomCommand: () => state.mutate,
}));
vi.mock("../../state/query", async (original) => ({
  ...(await original<typeof import("../../state/query")>()),
  useEnvironmentQuery: () => ({ data: null, error: null, isPending: false, refresh: state.mutate }),
}));
vi.mock("../../state/session", async (original) => ({
  ...(await original<typeof import("../../state/session")>()),
  useEnvironmentScope: () => state.allowed,
  readEnvironmentScope: () => state.allowed,
}));
vi.mock("../../hooks/useSettings", async (original) => ({
  ...(await original<typeof import("../../hooks/useSettings")>()),
  useEnvironmentSettings: () => DEFAULT_UNIFIED_SETTINGS,
  useUpdateEnvironmentSettings: () => state.mutate,
  useUpdateEnvironmentModelPreferences: () => state.mutate,
  useToggleEnvironmentModelFavorite: () => state.mutate,
  usePersistEnvironmentProviderInstanceMutation: () => state.mutate,
}));
vi.mock("../../state/entities", async (original) => ({
  ...(await original<typeof import("../../state/entities")>()),
  useProjects: () => [],
}));
vi.mock("../ProviderUpdatesAction", async (original) => ({
  ...(await original<typeof import("../ProviderUpdatesAction")>()),
  ProviderUpdatesAction: () => null,
}));
vi.mock("./ElysiaSetupSection", async (original) => ({
  ...(await original<typeof import("./ElysiaSetupSection")>()),
  ElysiaSetupSection: () => null,
}));
vi.mock(import("./settingsLayout"), async (original) => ({
  ...(await original()),
  useSettingsSearchTargetId: () => null,
  SettingsRow: ({
    title,
    description,
    control,
    children,
  }: {
    title: ReactNode;
    description?: ReactNode;
    control?: ReactNode;
    children?: ReactNode;
  }) => (
    <div>
      <h4>{title}</h4>
      {description}
      {control}
      {children}
    </div>
  ),
}));

import { EnvironmentProviderSettings } from "./ProviderSettingsPanel";

it.each([true, false])(
  "keeps provider accounts native-only with manage permission=%s",
  async (allowed) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.allowed = allowed;
    state.mutate.mockClear();
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <EnvironmentProviderSettings
            environmentId={EnvironmentId.make("native-policy-fixture")}
            environmentLabel="Elysia"
            readOnly={!allowed}
          />,
        ),
      );
      expect(container.querySelector('button[aria-label="Add provider"]')).toBeNull();
      expect(container.querySelector('[role="dialog"]')).toBeNull();
      expect(container.textContent).toContain("Elysia CLI");
      expect(container.querySelector('input[placeholder="codex"]')).toBeNull();
      expect(state.mutate).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);

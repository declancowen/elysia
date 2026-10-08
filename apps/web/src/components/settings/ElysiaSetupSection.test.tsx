// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderAuthState,
  type ServerProvider,
} from "@elysiatools/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const setup = vi.hoisted(() => ({
  auth: null as ProviderAuthState | null,
  start: vi.fn(),
  respond: vi.fn(),
  cancel: vi.fn(),
  logout: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("../../state/server", () => ({
  serverEnvironment: {
    providerAuthState: () => "auth",
    startProviderAuth: setup.start,
    respondProviderAuth: setup.respond,
    cancelProviderAuth: setup.cancel,
    logoutProviderAuth: setup.logout,
  },
}));
vi.mock("../../state/query", () => ({ useEnvironmentQuery: () => ({ data: setup.auth }) }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: (command: unknown) => command }));
vi.mock("../ui/toast", () => ({ toastManager: { add: setup.toast } }));

import { ElysiaSetupSection } from "./ElysiaSetupSection";

const instanceId = ProviderInstanceId.make("claudeAgent");
const provider: ServerProvider = {
  instanceId,
  driver: ProviderDriverKind.make("claudeAgent"),
  installed: true,
  enabled: true,
  version: "0.3.8",
  runtimeVersion: "2.1.285",
  status: "warning",
  auth: { status: "unauthenticated" },
  message: "Elysia credentials are incomplete or were rejected.",
  checkedAt: "2026-10-01T00:00:00.000Z",
  models: [],
  skills: [],
  slashCommands: [],
};
function authState(patch: Partial<ProviderAuthState> = {}): ProviderAuthState {
  return {
    instanceId,
    phase: "idle",
    flowId: null,
    authorizationUrl: null,
    expiresAt: null,
    message: null,
    ...patch,
  };
}
let root: Root;
let container: HTMLDivElement;
const onContinue = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  setup.auth = authState();
  for (const command of [setup.start, setup.respond, setup.cancel, setup.logout]) {
    command.mockResolvedValue({ _tag: "Success", value: undefined });
  }
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(currentProvider = provider, onboarding = true) {
  await act(async () =>
    root.render(
      <ElysiaSetupSection
        environmentId={EnvironmentId.make("local")}
        instanceId={instanceId}
        provider={currentProvider}
        enabled
        readOnly={false}
        onContinue={onboarding ? onContinue : undefined}
      />,
    ),
  );
}
function button(label: string) {
  return [...container.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === label,
  );
}

it("opens an existing installation without stale cancellation or credential errors", async () => {
  setup.auth = authState({ phase: "cancelled", flowId: "old", message: "Sign-in cancelled." });
  await render();
  expect(container.querySelector('section[aria-label="Installed"]')?.textContent).toContain(
    "Claude Code",
  );
  expect(container.querySelector('section[aria-label="Not installed"]')).toBeNull();
  expect(container.textContent).toContain("Claude Code (2.1.285)");
  expect(button("Install Elysia")).toBeUndefined();
  expect(button("Connect Elysia")).toBeUndefined();
  expect(container.querySelector("progress")).toBeNull();
  expect(container.textContent).not.toContain("VPN/Zscaler");
  expect(container.textContent).not.toContain("Sign-in cancelled");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(setup.toast).not.toHaveBeenCalled();
  expect(button("Continue")?.disabled).toBe(false);
});

it("changes credentials in Settings without repeating onboarding package groups", async () => {
  await render({ ...provider, status: "ready", auth: { status: "authenticated" } }, false);
  expect(container.querySelector('section[aria-label="Installed"]')).toBeNull();
  expect(container.querySelector('section[aria-label="Not installed"]')).toBeNull();
  expect(button("Disconnect Elysia")).toBeDefined();
  await act(async () => button("Change credentials")!.click());
  expect(setup.start).toHaveBeenCalledOnce();
  setup.auth = authState({
    phase: "waiting",
    flowId: "change-credentials",
    interaction: {
      id: "credentials",
      type: "credentials",
      fields: [{ name: "api_key", label: "API key", secret: true }],
    },
  });
  await render(provider, false);
  expect(container.querySelector<HTMLInputElement>("input")?.type).toBe("password");
  expect(button("Connect")).toBeDefined();
  expect(container.querySelector('section[aria-label="Installed"]')).toBeNull();
  expect(setup.toast).not.toHaveBeenCalled();
});

it("offers missing prerequisite installation when Elysia exists but Claude Code does not", async () => {
  await render({ ...provider, runtimeVersion: null });
  expect(container.querySelector('section[aria-label="Installed"]')?.textContent).toContain(
    "Elysia CLI",
  );
  expect(container.querySelector('section[aria-label="Not installed"]')?.textContent).toContain(
    "Claude Code",
  );
  expect(button("Install missing prerequisites")).toBeUndefined();
  expect(container.querySelector("progress")).toBeNull();
  await act(async () => button("Continue")!.click());
  expect(setup.start).toHaveBeenCalledOnce();
  expect(onContinue).not.toHaveBeenCalled();
  expect(button("Continue")?.disabled).toBe(false);
});

it("tracks installation progress and reports only a newly attempted flow's failure", async () => {
  setup.auth = authState({ phase: "failed", flowId: "old", message: "Old failure" });
  await render({ ...provider, version: null, runtimeVersion: null, installed: false });
  await act(async () => button("Continue")!.click());
  expect(setup.start).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(setup.toast).not.toHaveBeenCalled();
  setup.auth = authState({
    phase: "starting",
    flowId: "new",
    message: "3/4 · Installing Claude Code…",
  });
  await render({ ...provider, version: null, runtimeVersion: null, installed: false });
  expect(container.querySelector("progress")?.value).toBe(50);
  expect(container.textContent).toContain("50%");
  setup.auth = authState({
    phase: "waiting",
    flowId: "new",
    message: "Enter company credentials.",
  });
  await render({ ...provider, version: null, runtimeVersion: null, installed: false });
  expect(container.querySelector("progress")).toBeNull();
  expect(container.querySelector('section[aria-label="Installed"]')?.textContent).toContain(
    "Elysia CLI",
  );
  expect(container.querySelector('section[aria-label="Not installed"]')).toBeNull();
  expect(button("Install Elysia")).toBeUndefined();
  expect(button("Cancel setup")).toBeDefined();
  setup.auth = authState({ phase: "failed", flowId: "new", message: "Company connection failed." });
  await render();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Company connection failed.");
  expect(setup.toast).toHaveBeenCalledWith(
    expect.objectContaining({ type: "error", description: "Company connection failed." }),
  );
});

it("allows entry and marks the company connection active only after verified authentication", async () => {
  await render();
  expect(container.textContent).not.toContain("VPN/Zscaler");
  await act(async () => button("Continue")!.click());
  expect(onContinue).not.toHaveBeenCalled();
  await render({ ...provider, status: "ready", auth: { status: "authenticated" } });
  expect(container.textContent).not.toContain("VPN/Zscaler");
  expect(container.querySelector("progress")).toBeNull();
  await act(async () => button("Continue")!.click());
  expect(onContinue).toHaveBeenCalledOnce();
});

it("submits credentials from the single footer button, then gates entry on verification", async () => {
  setup.auth = authState({
    phase: "waiting",
    flowId: "credentials",
    interaction: {
      type: "credentials",
      id: "company-sign-in",
      fields: [
        { name: "workspace_id", label: "Workspace ID", secret: false },
        { name: "api_key", label: "API key", secret: true },
      ],
    },
  });
  await render();
  expect(button("Connect Elysia")).toBeUndefined();
  expect(button("Continue")).toBeUndefined();
  const fields = container.querySelectorAll("input");
  expect(fields[1]?.type).toBe("password");
  expect(fields[1]?.placeholder).toBe("****");
  await act(async () => button("Connect")!.click());
  expect(setup.respond).not.toHaveBeenCalled();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    fields.forEach((field, index) => {
      setter.call(field, index ? "test-key" : "workspace");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
  await act(async () => button("Connect")!.click());
  expect(setup.respond).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({
        response: {
          type: "credentials",
          values: { workspace_id: "workspace", api_key: "test-key" },
        },
      }),
    }),
  );
  setup.auth = { ...setup.auth!, phase: "verifying" };
  await render();
  expect(button("Connect")).toBeUndefined();
  expect(button("Connecting…")?.disabled).toBe(true);
  expect(onContinue).not.toHaveBeenCalled();
  setup.auth = authState({ phase: "succeeded", flowId: "credentials" });
  await render({ ...provider, status: "ready", auth: { status: "authenticated" } });
  await act(async () => button("Continue")!.click());
  expect(onContinue).toHaveBeenCalledOnce();
  await render({ ...provider, status: "ready", auth: { status: "authenticated" } }, false);
  expect(container.textContent).toContain("Company connection: managed by the Elysia CLI.");
});

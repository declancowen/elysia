// @vitest-environment jsdom
import { act, render as renderDom } from "../../../test/render";
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
const onContinue = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  setup.auth = authState();
  for (const command of [setup.start, setup.respond, setup.cancel, setup.logout]) {
    command.mockResolvedValue({ _tag: "Success", value: undefined });
  }
});
afterEach(async () => {});
function view(currentProvider = provider, onboarding = true) {
  return (
    <ElysiaSetupSection
      environmentId={EnvironmentId.make("local")}
      instanceId={instanceId}
      provider={currentProvider}
      enabled
      readOnly={false}
      onContinue={onboarding ? onContinue : undefined}
    />
  );
}
function button(label: string) {
  return [...document.body.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === label,
  );
}

it("opens an existing installation without stale cancellation or credential errors", async () => {
  setup.auth = authState({ phase: "cancelled", flowId: "old", message: "Sign-in cancelled." });
  await using screen = await renderDom(view(), { router: false });
  expect(screen.container.querySelector('section[aria-label="Installed"]')?.textContent).toContain(
    "Claude Code",
  );
  expect(screen.container.querySelector('section[aria-label="Not installed"]')).toBeNull();
  expect(screen.container.textContent).toContain("Claude Code (2.1.285)");
  expect(button("Install Elysia")).toBeUndefined();
  expect(button("Connect Elysia")).toBeUndefined();
  expect(screen.container.querySelector("progress")).toBeNull();
  expect(screen.container.textContent).not.toContain("VPN/Zscaler");
  expect(screen.container.textContent).not.toContain("Sign-in cancelled");
  expect(screen.container.querySelector('[role="alert"]')).toBeNull();
  expect(setup.toast).not.toHaveBeenCalled();
  expect(button("Continue")?.disabled).toBe(false);
});

it("changes credentials in Settings without repeating onboarding package groups", async () => {
  await using screen = await renderDom(
    view({ ...provider, status: "ready", auth: { status: "authenticated" } }, false),
    { router: false },
  );
  expect(screen.container.querySelector('section[aria-label="Installed"]')).toBeNull();
  expect(screen.container.querySelector('section[aria-label="Not installed"]')).toBeNull();
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
  await screen.rerender(view(provider, false));
  expect(screen.container.querySelector<HTMLInputElement>("input")?.type).toBe("password");
  expect(button("Connect")).toBeDefined();
  expect(screen.container.querySelector('section[aria-label="Installed"]')).toBeNull();
  expect(setup.toast).not.toHaveBeenCalled();
});

it("offers missing prerequisite installation when Elysia exists but Claude Code does not", async () => {
  await using screen = await renderDom(view({ ...provider, runtimeVersion: null }), {
    router: false,
  });
  expect(screen.container.querySelector('section[aria-label="Installed"]')?.textContent).toContain(
    "Elysia CLI",
  );
  expect(
    screen.container.querySelector('section[aria-label="Not installed"]')?.textContent,
  ).toContain("Claude Code");
  expect(button("Install missing prerequisites")).toBeUndefined();
  expect(screen.container.querySelector("progress")).toBeNull();
  await act(async () => button("Continue")!.click());
  expect(setup.start).toHaveBeenCalledOnce();
  expect(onContinue).not.toHaveBeenCalled();
  expect(button("Continue")?.disabled).toBe(false);
});

it("tracks installation progress and reports only a newly attempted flow's failure", async () => {
  setup.auth = authState({ phase: "failed", flowId: "old", message: "Old failure" });
  await using screen = await renderDom(
    view({ ...provider, version: null, runtimeVersion: null, installed: false }),
    { router: false },
  );
  await act(async () => button("Continue")!.click());
  expect(setup.start).toHaveBeenCalledOnce();
  expect(screen.container.querySelector('[role="alert"]')).toBeNull();
  expect(setup.toast).not.toHaveBeenCalled();
  setup.auth = authState({
    phase: "starting",
    flowId: "new",
    message: "3/4 · Installing Claude Code…",
  });
  await screen.rerender(
    view({ ...provider, version: null, runtimeVersion: null, installed: false }),
  );
  expect(screen.container.querySelector("progress")?.value).toBe(50);
  expect(screen.container.textContent).toContain("50%");
  setup.auth = authState({
    phase: "waiting",
    flowId: "new",
    message: "Enter company credentials.",
  });
  await screen.rerender(
    view({ ...provider, version: null, runtimeVersion: null, installed: false }),
  );
  expect(screen.container.querySelector("progress")).toBeNull();
  expect(screen.container.querySelector('section[aria-label="Installed"]')?.textContent).toContain(
    "Elysia CLI",
  );
  expect(screen.container.querySelector('section[aria-label="Not installed"]')).toBeNull();
  expect(button("Install Elysia")).toBeUndefined();
  expect(button("Cancel setup")).toBeDefined();
  setup.auth = authState({ phase: "failed", flowId: "new", message: "Company connection failed." });
  await screen.rerender(view());
  expect(screen.container.querySelector('[role="alert"]')?.textContent).toBe(
    "Company connection failed.",
  );
  expect(setup.toast).toHaveBeenCalledWith(
    expect.objectContaining({ type: "error", description: "Company connection failed." }),
  );
});

it("allows entry and marks the company connection active only after verified authentication", async () => {
  await using screen = await renderDom(view(), { router: false });
  expect(screen.container.textContent).not.toContain("VPN/Zscaler");
  await act(async () => button("Continue")!.click());
  expect(onContinue).not.toHaveBeenCalled();
  await screen.rerender(view({ ...provider, status: "ready", auth: { status: "authenticated" } }));
  expect(screen.container.textContent).not.toContain("VPN/Zscaler");
  expect(screen.container.querySelector("progress")).toBeNull();
  await act(async () => button("Continue")!.click());
  expect(onContinue).toHaveBeenCalledOnce();
});

it.each(["throw", "reject"] as const)(
  "clears pending and preserves the safe setup error when a command fails by %s",
  async (failure) => {
    const diagnostic = new Error("Private transport diagnostic");
    if (failure === "throw")
      setup.start.mockImplementationOnce(() => {
        throw diagnostic;
      });
    else setup.start.mockRejectedValueOnce(diagnostic);
    await using screen = await renderDom(view(), { router: false });
    await act(async () => button("Continue")!.click());
    expect(button("Continue")?.disabled).toBe(false);
    expect(screen.container.querySelector('[role="alert"]')?.textContent).toBe(
      "Elysia could not complete the request. Check the setup status and retry.",
    );
    expect(setup.toast).toHaveBeenCalledWith({
      type: "error",
      title: "Could not connect Elysia",
      description: "Check the setup status and retry.",
    });
    expect(screen.container.textContent).not.toContain(diagnostic.message);
    expect(onContinue).not.toHaveBeenCalled();
    await act(async () => button("Continue")!.click());
    expect(setup.start).toHaveBeenCalledTimes(2);
    expect(screen.container.querySelector('[role="alert"]')).toBeNull();
    expect(button("Continue")?.disabled).toBe(false);
  },
);

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
  await using screen = await renderDom(view(), { router: false });
  expect(button("Connect Elysia")).toBeUndefined();
  expect(button("Continue")).toBeUndefined();
  const fields = screen.container.querySelectorAll("input");
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
  await screen.rerender(view());
  expect(button("Connect")).toBeUndefined();
  expect(button("Connecting…")?.disabled).toBe(true);
  expect(onContinue).not.toHaveBeenCalled();
  setup.auth = authState({ phase: "succeeded", flowId: "credentials" });
  await screen.rerender(view({ ...provider, status: "ready", auth: { status: "authenticated" } }));
  await act(async () => button("Continue")!.click());
  expect(onContinue).toHaveBeenCalledOnce();
  await screen.rerender(
    view({ ...provider, status: "ready", auth: { status: "authenticated" } }, false),
  );
  expect(screen.container.textContent).toContain("Company connection: managed by the Elysia CLI.");
});

vi.mock("vite-plus/test/browser", () => ({
  page: { elementLocator: () => ({}) },
  utils: { getElementLocatorSelectors: () => ({}) },
}));

import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const policy = vi.hoisted(() => ({ connectionsEnabled: false }));
vi.mock("@t3tools/contracts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@t3tools/contracts")>()),
  get CONNECTIONS_ENABLED() {
    return policy.connectionsEnabled;
  },
}));

import { isLocalEnvironmentDisabled } from "./localEnvironment";
import { readPrimaryEnvironmentTarget } from "./environments/primary/target";

beforeEach(() => {
  policy.connectionsEnabled = false;
  vi.stubEnv("VITE_HTTP_URL", "");
  vi.stubEnv("VITE_WS_URL", "");
  vi.stubGlobal("window", {
    location: new URL("http://127.0.0.1:3773/"),
    desktopBridge: {
      getLocalEnvironmentEnabled: () => false,
      getLocalEnvironmentBootstraps: () => [],
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("keeps primary transport available despite a saved remote-only setting in Elysia", () => {
  expect(isLocalEnvironmentDisabled()).toBe(false);
  expect(readPrimaryEnvironmentTarget()).toEqual({
    source: "window-origin",
    target: { httpBaseUrl: "http://127.0.0.1:3773/", wsBaseUrl: "ws://127.0.0.1:3773/" },
  });
});

it("retains remote-only behavior when the connections policy enables it", () => {
  policy.connectionsEnabled = true;
  expect(isLocalEnvironmentDisabled()).toBe(true);
  expect(readPrimaryEnvironmentTarget()).toBeNull();
});

it("keeps a browser primary available when no desktop bridge exists", () => {
  policy.connectionsEnabled = true;
  vi.stubGlobal("window", { location: new URL("http://127.0.0.1:3773/") });
  expect(isLocalEnvironmentDisabled()).toBe(false);
  expect(readPrimaryEnvironmentTarget()?.source).toBe("window-origin");
});

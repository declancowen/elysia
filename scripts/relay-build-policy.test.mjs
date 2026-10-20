import { expect, it, vi } from "vite-plus/test";
import { UPSTREAM_ANALYTICS_ENABLED } from "../packages/contracts/src/forkPolicy.ts";

// Build-definition inspection does not create a browser test project.
vi.mock("vite-plus/test/browser-playwright", () => ({ playwright: () => ({}) }));

vi.mock("./lib/public-config", () => ({
  loadRepoEnv: () => ({
    EXPO_PUBLIC_OTLP_TRACES_URL: "https://disabled-relay.fixture.test/v1/traces",
    EXPO_PUBLIC_OTLP_TRACES_DATASET: "disabled-relay-fixture-dataset",
    EXPO_PUBLIC_OTLP_TRACES_TOKEN: "disabled-relay-fixture-token",
    VITE_RELAY_OTLP_TRACES_URL: "https://disabled-relay.fixture.test/v1/traces",
    VITE_RELAY_OTLP_TRACES_DATASET: "disabled-relay-fixture-dataset",
    VITE_RELAY_OTLP_TRACES_TOKEN: "disabled-relay-fixture-token",
    T3CODE_RELAY_CLIENT_OTLP_TRACES_URL: "https://disabled-relay.fixture.test/v1/traces",
    T3CODE_RELAY_CLIENT_OTLP_TRACES_DATASET: "disabled-relay-fixture-dataset",
    T3CODE_RELAY_CLIENT_OTLP_TRACES_TOKEN: "disabled-relay-fixture-token",
  }),
}));

it("does not embed configured relay credentials in server or renderer builds", async () => {
  expect(UPSTREAM_ANALYTICS_ENABLED).toBe(false);
  const mobile = (await import("../apps/mobile/app.config.ts")).default;
  const server = (await import("../apps/server/vite.config.ts")).default;
  const web = (await import("../apps/web/vite.config.ts")).default;
  const resolvedWeb =
    typeof web === "function" ? await web({ command: "build", mode: "production" }) : await web;
  for (const config of [server, resolvedWeb, mobile]) {
    const serialized = JSON.stringify(config);
    expect(serialized).not.toContain("disabled-relay.fixture.test");
    expect(serialized).not.toContain("disabled-relay-fixture-dataset");
    expect(serialized).not.toContain("disabled-relay-fixture-token");
  }
});

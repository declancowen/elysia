import { vi } from "vite-plus/test";

type ForkPolicy = Pick<
  typeof import("@elysiatools/contracts"),
  | "SINGLE_PROVIDER_UI"
  | "APP_NAME"
  | "CONNECTIONS_ENABLED"
  | "EXTERNAL_USAGE_SOURCES_ENABLED"
  | "UPSTREAM_ANALYTICS_ENABLED"
  | "isEnabledProviderDriver"
  | "isConnectionsRpcMethod"
  | "isConnectionsHttpPath"
>;

const upstreamForkPolicy = vi.hoisted(() => ({ singleProviderUi: false }));

// Import only in dormant upstream suites. Elysia policy tests exercise the real
// production module; these fixtures still cover the retained multi-provider code.
vi.mock("../../../../packages/contracts/src/forkPolicy.ts", async (importOriginal) => ({
  ...(await importOriginal<ForkPolicy>()),
  get SINGLE_PROVIDER_UI() {
    return upstreamForkPolicy.singleProviderUi;
  },
  CONNECTIONS_ENABLED: true,
  EXTERNAL_USAGE_SOURCES_ENABLED: true,
  UPSTREAM_ANALYTICS_ENABLED: true,
  isEnabledProviderDriver: () => true,
}));

vi.mock("../provider/builtInDrivers.ts", async (importOriginal) => {
  const [codex, claude, cursor, grok, openCode, antigravity, muse, pi] = await Promise.all([
    import("../provider/Drivers/CodexDriver.ts"),
    import("../provider/Drivers/ClaudeDriver.ts"),
    import("@elysiatools/provider-cursor/server"),
    import("@elysiatools/provider-grok/server"),
    import("@elysiatools/provider-opencode/server"),
    import("../provider/Drivers/AntigravityDriver.ts"),
    import("@elysiatools/provider-muse/server"),
    import("@elysiatools/provider-pi/server"),
  ]);
  return {
    ...(await importOriginal<typeof import("../provider/builtInDrivers.ts")>()),
    BUILT_IN_DRIVERS: [
      codex.CodexDriver,
      claude.ClaudeDriver,
      cursor.CursorDriver,
      grok.GrokDriver,
      openCode.OpenCodeDriver,
      antigravity.AntigravityDriver,
      muse.MuseDriver,
      pi.PiDriver,
    ],
  };
});

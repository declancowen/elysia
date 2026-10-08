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

export function setUpstreamSingleProviderUi(enabled: boolean): void {
  upstreamForkPolicy.singleProviderUi = enabled;
}

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

vi.mock("../provider/builtInDrivers.ts", async () => {
  const [codex, claude, cursor, grok, openCode, antigravity] = await Promise.all([
    import("../provider/Drivers/CodexDriver.ts"),
    import("../provider/Drivers/ClaudeDriver.ts"),
    import("../provider/Drivers/CursorDriver.ts"),
    import("../provider/Drivers/GrokDriver.ts"),
    import("../provider/Drivers/OpenCodeDriver.ts"),
    import("../provider/Drivers/AntigravityDriver.ts"),
  ]);
  return {
    BUILT_IN_DRIVERS: [
      codex.CodexDriver,
      claude.ClaudeDriver,
      cursor.CursorDriver,
      grok.GrokDriver,
      openCode.OpenCodeDriver,
      antigravity.AntigravityDriver,
    ],
  };
});

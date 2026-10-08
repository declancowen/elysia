// @effect-diagnostics nodeBuiltinImport:off - Knip and the TypeScript compiler host use synchronous Node paths.
import * as NodePath from "node:path";
import { APP_NAME, CONNECTIONS_ENABLED } from "../packages/contracts/src/forkPolicy.ts";
import type { Preprocessor } from "knip";
// Knip needs the legacy compiler API, which TypeScript 7 no longer exports.
import ts from "typescript-legacy";

// Effect 4 schemas carry this marker, including aliases and Schema.Class constructors.
// Checking the type avoids evaluating application modules or exempting schema factories/decoders.
const schemaTypeId = "~effect/Schema/Schema";

// Elysia retains upstream APIs whose callers are dormant under its fork policy.
// Match both the source file and symbol so new unused exports remain visible.
const retainedForkExports: Readonly<Record<string, ReadonlyArray<string>>> = {
  // Upstream triage imports the boot-service log path.
  "apps/server/src/cloud/bootService.ts": ["BOOT_SERVICE_LOG_FILE"],
  // Stable branding uses this helper internally; retain its upstream public API.
  "apps/web/src/branding.logic.ts": ["formatAppDisplayName"],
  // Retained Connections and Elysia Connect screens consume these APIs.
  "apps/web/src/components/clerk/ElysiaConnectAccountPages.tsx": ["useT3ConnectAccountPage"],
  "apps/web/src/components/settings/EnvironmentIconPicker.tsx": ["EnvironmentIconMenu"],
  "apps/web/src/components/settings/EnvironmentRow.tsx": ["formatDesktopSshTarget"],
  "apps/web/src/components/settings/GitHubRoutingSettings.tsx": ["GitHubRoutingSettings"],
  "apps/web/src/components/settings/LoadBalancingSettings.tsx": ["LoadBalancingSettings"],
  "apps/web/src/connection/onboarding.ts": ["connectSshEnvironment"],
  "apps/web/src/environments/primary/auth.ts": [
    "revokeServerPairingLink",
    "revokeServerClientSession",
    "revokeOtherServerClientSessions",
  ],
  "apps/web/src/environments/primary/index.ts": [
    "revokeServerPairingLink",
    "revokeServerClientSession",
    "revokeOtherServerClientSessions",
    "isLoopbackHostname",
  ],
  "apps/web/src/state/desktopNetworkAccess.ts": [
    "desktopNetworkAccessStateAtom",
    "refreshDesktopNetworkAccessState",
  ],
  "apps/web/src/state/desktopSshHosts.ts": ["desktopSshHostsStateAtom"],
  "apps/web/src/state/desktopWslState.ts": ["refreshDesktopWslState"],
  "packages/client-runtime/src/state/auth.ts": ["createAuthEnvironmentAtoms"],
  // The fork fixes grouping, environment identification and releases to its defaults.
  "apps/web/src/components/settings/SettingsPanels.logic.ts": [
    "readLastEnabledProjectGroupingMode",
    "rememberEnabledProjectGroupingMode",
  ],
  "packages/contracts/src/settings.ts": ["DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE"],
  "packages/shared/src/cliRelease.ts": ["CLI_RELEASE_CHANNELS"],
};

const preprocess: Preprocessor = (options) => {
  if (APP_NAME === "Elysia" && !CONNECTIONS_ENABLED) {
    for (const category of ["exports", "nsExports"] as const) {
      for (const [filePath, issues] of Object.entries(options.issues[category])) {
        const relativePath = NodePath.relative(options.cwd, NodePath.resolve(options.cwd, filePath))
          .split(NodePath.sep)
          .join("/");
        const allowed = retainedForkExports[relativePath];
        if (!allowed) continue;
        for (const [key, issue] of Object.entries(issues)) {
          const symbols = issue.symbols ?? [{ symbol: issue.symbol }];
          if (symbols.length > 0 && symbols.every(({ symbol }) => allowed.includes(symbol))) {
            delete issues[key];
            options.counters[category]--;
          }
        }
        if (Object.keys(issues).length === 0) delete options.issues[category][filePath];
      }
    }
  }
  const categories = ["exports", "nsExports", "duplicates"] as const;
  const projects = new Map<string | undefined, Set<string>>();
  for (const category of categories) {
    for (const [filePath, issues] of Object.entries(options.issues[category])) {
      if (Object.keys(issues).length === 0) continue;
      const configPath = ts.findConfigFile(
        NodePath.dirname(NodePath.resolve(options.cwd, filePath)),
        ts.sys.fileExists,
      );
      const files = projects.get(configPath) ?? new Set<string>();
      files.add(filePath);
      projects.set(configPath, files);
    }
  }

  for (const [configPath, files] of projects) {
    const config = configPath
      ? ts.getParsedCommandLineOfConfigFile(
          configPath,
          {},
          {
            ...ts.sys,
            onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
              throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
            },
          },
        )
      : undefined;
    if (config?.errors.length) {
      throw new Error(
        config.errors
          .map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"))
          .join("\n"),
      );
    }
    const program = ts.createProgram(
      [...files].map((file) => NodePath.resolve(options.cwd, file)),
      {
        module: ts.ModuleKind.NodeNext,
        allowJs: true,
        ...config?.options,
        noEmit: true,
      },
    );
    const checker = program.getTypeChecker();
    for (const filePath of files) {
      const source = program.getSourceFile(NodePath.resolve(options.cwd, filePath));
      const module = source && checker.getSymbolAtLocation(source);
      if (!source || !module) continue;
      const schemas = new Set(
        checker.getExportsOfModule(module).flatMap((symbol) => {
          const exported =
            symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
          // Duplicate exports can name a private value with a public type of the same name.
          const target =
            exported.flags & ts.SymbolFlags.Value
              ? exported
              : checker.resolveName(symbol.name, source, ts.SymbolFlags.Value, false);
          if (!target) return [];
          const type = checker.getTypeOfSymbolAtLocation(target, target.valueDeclaration ?? source);
          const marker = type.getProperty(schemaTypeId);
          if (!marker) return [];
          const markerType = checker.getTypeOfSymbolAtLocation(marker, source);
          return markerType.isStringLiteral() && markerType.value === schemaTypeId
            ? [symbol.name]
            : [];
        }),
      );
      for (const category of categories) {
        const issues = options.issues[category][filePath];
        if (!issues) continue;
        for (const [key, issue] of Object.entries(issues)) {
          const symbols = issue.symbols ?? [{ symbol: issue.symbol }];
          if (symbols.length > 0 && symbols.every(({ symbol }) => schemas.has(symbol))) {
            delete issues[key];
            options.counters[category]--;
          }
        }
        if (Object.keys(issues).length === 0) delete options.issues[category][filePath];
      }
    }
  }
  return options;
};

export default preprocess;

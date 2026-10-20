/** Elysia configures Claude Code; keep its existing agent protocol and routing IDs. */
import {
  ClaudeSettings,
  ProviderDriverKind,
  ProviderSetupError,
  TextGenerationError,
} from "@elysiatools/contracts";
import * as Cache from "effect/Cache";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { HttpClient } from "effect/http";
import { ChildProcessSpawner } from "effect/process";
import { makeClaudeTextGeneration } from "../../textGeneration/ClaudeTextGeneration.ts";
import * as BackgroundPolicy from "../../background/BackgroundPolicy.ts";
import { ServerConfig } from "../../config.ts";
import { expandHomePath } from "@elysiatools/provider-core/server/pathExpansion";
import { ServerSettingsService } from "../../serverSettings.ts";
import { ProviderDriverError } from "../Errors.ts";
import {
  makeClaudeAdapterV2,
  ClaudeAgentSdkQueryRunner,
} from "../../orchestration-v2/Adapters/ClaudeAdapterV2.ts";
import { IdAllocatorV2 } from "@elysiatools/provider-core/server/IdAllocator";
import { ProviderContinuationRequests } from "@elysiatools/provider-core/server/ProviderContinuationRequests";
import { makeClaudeScopedLimitNames } from "../claudeUsageLimits.ts";
import {
  checkClaudeProviderStatus,
  makePendingClaudeProvider,
  probeClaudeCapabilities,
} from "../ClaudeProvider.ts";
import { ProviderEventLoggers } from "@elysiatools/provider-core/server/ProviderEventLoggers";
import { ProviderHost } from "@elysiatools/provider-core/server/ProviderHost";
import { HomeDirectory } from "@elysiatools/shared/HostProcess";
import { ProviderLatestVersions } from "@elysiatools/provider-core/server/ProviderLatestVersions";
import { McpProviderSessions } from "@elysiatools/provider-core/server/McpProviderSessions";
import { makeManagedServerProvider } from "@elysiatools/provider-core/server/managedProvider";
import {
  type ProviderDriver,
  type ProviderInstance,
} from "@elysiatools/provider-core/server/driver";
import { withInstanceIdentity } from "@elysiatools/provider-core/server/instanceIdentity";
import { mergeProviderInstanceEnvironment } from "@elysiatools/provider-core/server/instanceEnvironment";
import {
  enrichProviderSnapshotWithVersionAdvisory,
  makeCachedProviderMaintenanceResolution,
  makeProviderMaintenanceCapabilities,
  resolveProviderMaintenanceCapabilitiesEffect,
} from "@elysiatools/provider-core/server/maintenanceResolver";
import { CLAUDE_RUNTIME_UPDATE } from "./ClaudeDriver.ts";
import {
  haveProviderSnapshotSettingsChanged,
  makeProviderSnapshotSettingsSource,
  type ProviderSnapshotSettings,
} from "@elysiatools/provider-core/server/snapshotSettings";
import { makeClaudeContinuationGroupKey } from "./ClaudeHome.ts";
import { makeElysiaCli } from "../ElysiaCli.ts";
import { ELYSIA_MODELS, elysiaModelCatalog } from "../ElysiaModelCatalog.ts";
import * as ProviderAuthFlow from "@elysiatools/provider-core/server/providerAuthFlow";
import { elysiaChatSlashCommands } from "./ElysiaSlashCommands.ts";
import { discoverClaudeSkills } from "./ClaudeSkills.ts";

const DRIVER_KIND = ProviderDriverKind.make("claudeAgent");
const Identifier = Schema.String.check(
  Schema.isPattern(/^[a-zA-Z0-9-]+$/),
  Schema.isMaxLength(256),
);
const Credentials = Schema.Struct({
  workspace_id: Identifier,
  config_id: Identifier,
  user_id: Identifier,
  api_key: Schema.String.check(Schema.isMinLength(5), Schema.isMaxLength(16384)),
});
const decodeCredentials = Schema.decodeUnknownEffect(Credentials);
const decodeClaudeSettings = Schema.decodeSync(ClaudeSettings);

export type ElysiaDriverEnv =
  | ClaudeAgentSdkQueryRunner
  | IdAllocatorV2
  | BackgroundPolicy.BackgroundPolicy
  | ChildProcessSpawner.ChildProcessSpawner
  | Crypto.Crypto
  | FileSystem.FileSystem
  | HttpClient.HttpClient
  | Path.Path
  | ProviderEventLoggers
  | ProviderHost
  | ProviderLatestVersions
  | McpProviderSessions
  | ServerConfig
  | ServerSettingsService;

export const ElysiaDriver: ProviderDriver<ClaudeSettings, ElysiaDriverEnv> = {
  driverKind: DRIVER_KIND,
  metadata: { displayName: "Elysia", supportsMultipleInstances: true },
  configSchema: ClaudeSettings,
  defaultConfig: () => decodeClaudeSettings({}),
  create: Effect.fn("ElysiaDriver.create")(function* ({
    instanceId,
    accentColor,
    environment,
    enabled,
    config,
  }) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { cwd, stateDir } = yield* ServerConfig;
    const httpClient = yield* HttpClient.HttpClient;
    const latestVersions = yield* ProviderLatestVersions;
    const serverSettings = yield* ServerSettingsService;
    const initialSettings = yield* serverSettings.getSettings.pipe(Effect.orDie);
    const appDefaultModel =
      initialSettings.defaultModelSelection?.instanceId === instanceId
        ? initialSettings.defaultModelSelection.model
        : undefined;
    const elysia = yield* makeElysiaCli({
      instanceId,
      stateDir,
      config: {
        ...config,
        enabled,
        ...(appDefaultModel ? { elysiaDefaultModel: appDefaultModel } : {}),
      },
      environment: yield* mergeProviderInstanceEnvironment(environment),
      checkUpdates: serverSettings.getSettings.pipe(
        Effect.map((settings) => enabled && settings.enableProviderUpdateChecks),
        Effect.orElseSucceed(() => false),
      ),
    }).pipe(
      Effect.mapError(
        (cause) =>
          new ProviderDriverError({
            driver: DRIVER_KIND,
            instanceId,
            detail: cause.detail,
            cause,
          }),
      ),
    );
    const processEnv = elysia.environment;
    if (yield* elysia.ready) {
      yield* elysia.restoreCompression.pipe(
        Effect.catch((error) => Effect.logWarning(error.detail)),
        Effect.forkScoped,
      );
    }
    if (yield* elysia.ready) {
      const settings = yield* elysia.readSettings;
      const savedDefault = appDefaultModel ?? config.elysiaDefaultModel;
      if (
        settings._tag === "Some" &&
        (!savedDefault || !settings.value.allowed_models.includes(savedDefault))
      )
        yield* serverSettings
          .updateSettings({
            defaultModelSelection: { instanceId, model: settings.value.model },
          })
          .pipe(
            Effect.mapError(
              (cause) =>
                new ProviderDriverError({
                  driver: DRIVER_KIND,
                  instanceId,
                  detail: "Could not sync the Elysia CLI default model.",
                  cause,
                }),
            ),
          );
    }
    const effectiveConfig = {
      ...config,
      enabled,
      binaryPath: expandHomePath(config.binaryPath, yield* HomeDirectory),
      homePath: path.join(elysia.root, ".claude"),
      customModels: [],
    } satisfies ClaudeSettings;
    const modelCatalog = Effect.gen(function* () {
      const settings = yield* elysia.readSettings;
      return settings._tag === "Some"
        ? elysiaModelCatalog(
            settings.value.allowed_models,
            settings.value.model,
            yield* elysia.modelMetadata,
          )
        : elysiaModelCatalog(ELYSIA_MODELS);
    });
    const continuationGroupKey = yield* makeClaudeContinuationGroupKey(effectiveConfig, processEnv);
    const stampIdentity = withInstanceIdentity({
      instanceId,
      driverKind: DRIVER_KIND,
      displayName: "Elysia",
      accentColor,
      continuationGroupKey,
    });
    const scopedLimitNames = yield* makeClaudeScopedLimitNames;
    const authorize = Effect.fnUntraced(function* (model?: string) {
      yield* elysia.requireReady;
      if (model && !(yield* modelCatalog).models.some((entry) => entry.model.slug === model))
        return yield* new ProviderSetupError({
          instanceId,
          operation: "model",
          detail: "Select a model from the Elysia gateway catalog.",
        });
    });
    const orchestrationAdapter = yield* makeClaudeAdapterV2({
      instanceId,
      settings: effectiveConfig,
      environment: processEnv,
      modelCatalog,
      // A native update installs user MCP/plugins that a live CLI has not loaded.
      queryConfigurationVersion: elysia.configurationVersion,
      authorizeModel: authorize,
      attachmentsDir: (yield* ServerConfig).attachmentsDir,
      crypto: yield* Crypto.Crypto,
      fileSystem: fs,
      path,
      idAllocator: yield* IdAllocatorV2,
      queryRunner: yield* ClaudeAgentSdkQueryRunner,
      continuationRequests: yield* ProviderContinuationRequests,
      scopedLimitNames,
      onElysiaDefaultModelChange: Effect.fn("ElysiaDriver.onElysiaDefaultModelChange")(
        function* (model) {
          yield* serverSettings.updateSettings({ defaultModelSelection: { instanceId, model } });
          yield* elysia.refreshEnvironment;
          yield* Cache.invalidateAll(capabilities);
          yield* snapshot.refresh;
        },
      ),
      onUsageLimits: (update) => snapshot.applyUsageLimits(update),
    });
    const nativeTextGeneration = yield* makeClaudeTextGeneration(
      effectiveConfig,
      processEnv,
      modelCatalog,
    );
    const textGeneration = {
      ...nativeTextGeneration,
      generateCommitMessage: (
        input: Parameters<typeof nativeTextGeneration.generateCommitMessage>[0],
      ) =>
        authorize(input.modelSelection.model).pipe(
          Effect.mapError(
            (error) =>
              new TextGenerationError({
                operation: "generateCommitMessage",
                detail: error.detail,
              }),
          ),
          Effect.andThen(nativeTextGeneration.generateCommitMessage(input)),
        ),
      generatePrContent: (input: Parameters<typeof nativeTextGeneration.generatePrContent>[0]) =>
        authorize(input.modelSelection.model).pipe(
          Effect.mapError(
            (error) =>
              new TextGenerationError({ operation: "generatePrContent", detail: error.detail }),
          ),
          Effect.andThen(nativeTextGeneration.generatePrContent(input)),
        ),
      generateBranchName: (input: Parameters<typeof nativeTextGeneration.generateBranchName>[0]) =>
        authorize(input.modelSelection.model).pipe(
          Effect.mapError(
            (error) =>
              new TextGenerationError({ operation: "generateBranchName", detail: error.detail }),
          ),
          Effect.andThen(nativeTextGeneration.generateBranchName(input)),
        ),
      generateThreadTitle: (
        input: Parameters<typeof nativeTextGeneration.generateThreadTitle>[0],
      ) =>
        authorize(input.modelSelection.model).pipe(
          Effect.mapError(
            (error) =>
              new TextGenerationError({ operation: "generateThreadTitle", detail: error.detail }),
          ),
          Effect.andThen(nativeTextGeneration.generateThreadTitle(input)),
        ),
    };
    const capabilities = yield* Cache.make({
      capacity: 1,
      timeToLive: Duration.minutes(5),
      lookup: () =>
        probeClaudeCapabilities(effectiveConfig, processEnv, cwd, false).pipe(
          Effect.provideService(Path.Path, path),
        ),
    });
    const resolveElysiaMaintenance = yield* makeCachedProviderMaintenanceResolution(
      elysia.maintenance,
    );
    const resolveRuntimeMaintenance = yield* makeCachedProviderMaintenanceResolution(
      resolveProviderMaintenanceCapabilitiesEffect(
        {
          resolve: (context) => {
            const runtimeRoot = path.join(elysia.root, "runtime");
            if (
              context &&
              path
                .relative(runtimeRoot, context.realCommandPath)
                .startsWith(`node_modules${path.sep}`)
            ) {
              return Effect.succeed(
                makeProviderMaintenanceCapabilities({
                  provider: DRIVER_KIND,
                  packageName: "@anthropic-ai/claude-code",
                  updateExecutable: "npm",
                  updateArgs: [
                    "install",
                    "--prefix",
                    runtimeRoot,
                    "--allow-scripts=@anthropic-ai/claude-code",
                    "@anthropic-ai/claude-code@latest",
                  ],
                  updateLockKey: `npm-local:${runtimeRoot}`,
                  env: processEnv,
                }),
              );
            }
            return CLAUDE_RUNTIME_UPDATE.resolve(context).pipe(
              Effect.map((maintenance) => ({
                ...maintenance,
                ...(maintenance.update
                  ? {
                      update: {
                        ...maintenance.update,
                        env: { ...processEnv, ...maintenance.update.env },
                      },
                    }
                  : {}),
              })),
            );
          },
        },
        { binaryPath: effectiveConfig.binaryPath, env: processEnv },
      ).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      ),
    );
    const resolveMaintenance = (options?: {
      readonly fresh?: boolean;
      readonly updateTarget?: "runtime";
    }) =>
      options?.updateTarget === "runtime"
        ? resolveRuntimeMaintenance(options)
        : resolveElysiaMaintenance(options);
    const checkProvider = Effect.gen(function* () {
      yield* elysia.refreshEnvironment;
      const catalog = yield* modelCatalog;
      const ready = yield* elysia.ready;
      const compression = yield* elysia.compression;
      const draft = ready
        ? yield* checkClaudeProviderStatus(
            effectiveConfig,
            () => Cache.get(capabilities, "elysia"),
            processEnv,
            cwd,
            catalog,
            scopedLimitNames,
          )
        : yield* checkClaudeProviderStatus(
            effectiveConfig,
            undefined,
            processEnv,
            cwd,
            catalog,
            scopedLimitNames,
          );
      return stampIdentity({
        ...draft,
        displayName: "Elysia",
        slashCommands: elysiaChatSlashCommands(draft.slashCommands, draft.skills),
        ...(compression._tag === "Some" ? { elysiaCompression: compression.value } : {}),
        requiresNewThreadForModelChange: false,
        runtimeVersion: draft.version,
        version: yield* elysia.version,
        // Native Elysia validates the sign-in; optional SDK discovery cannot revoke it.
        ...(ready
          ? { auth: { status: "authenticated" as const } }
          : {
              status: enabled ? ("warning" as const) : ("disabled" as const),
              auth: { status: "unauthenticated" as const },
              message:
                (yield* elysia.connectionError) ??
                "Connect Elysia in Settings → Providers to begin.",
            }),
      });
    }).pipe(
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );
    const source = yield* makeProviderSnapshotSettingsSource(effectiveConfig);
    const snapshot = yield* makeManagedServerProvider<ProviderSnapshotSettings<ClaudeSettings>>({
      resolveMaintenance,
      getSettings: source.getSettings,
      streamSettings: source.streamSettings,
      haveSettingsChanged: haveProviderSnapshotSettingsChanged,
      // Publish the native validated profile immediately; managed snapshots probe Claude in the background.
      initialSnapshot: Effect.fn("ElysiaDriver.initialSnapshot")(function* () {
        const pending = yield* makePendingClaudeProvider(effectiveConfig, yield* modelCatalog);
        const ready = yield* elysia.ready;
        const compression = yield* elysia.compression;
        return stampIdentity({
          ...pending,
          installed: ready,
          status: ready ? "ready" : enabled ? "warning" : "disabled",
          auth: { status: ready ? "authenticated" : "unauthenticated" },
          message: ready
            ? "Checking Claude Code…"
            : ((yield* elysia.connectionError) ??
              "Connect Elysia in Settings → Providers to begin."),
          version: yield* elysia.version,
          runtimeVersion: null,
          ...(compression._tag === "Some" ? { elysiaCompression: compression.value } : {}),
          requiresNewThreadForModelChange: false,
        });
      }),
      checkProvider,
      enrichSnapshot: Effect.fn("ElysiaDriver.enrichSnapshot")(
        function* ({ settings, snapshot }) {
          const native = yield* enrichProviderSnapshotWithVersionAdvisory(
            snapshot,
            yield* resolveElysiaMaintenance(),
            {
              enableProviderUpdateChecks: settings.enableProviderUpdateChecks,
            },
          );
          const runtime = yield* enrichProviderSnapshotWithVersionAdvisory(
            { ...snapshot, version: snapshot.runtimeVersion ?? null },
            yield* resolveRuntimeMaintenance(),
            {
              enableProviderUpdateChecks: settings.enableProviderUpdateChecks,
            },
          );
          return { ...native, runtimeVersionAdvisory: runtime.versionAdvisory };
        },
        (effect, { publishSnapshot }) =>
          effect.pipe(
            Effect.provideService(HttpClient.HttpClient, httpClient),
            Effect.provideService(ProviderLatestVersions, latestVersions),
            Effect.flatMap(publishSnapshot),
          ),
      ),
    }).pipe(
      Effect.mapError(
        (cause) =>
          new ProviderDriverError({
            driver: DRIVER_KIND,
            instanceId,
            detail: "Could not prepare Elysia.",
            cause,
          }),
      ),
    );
    const auth = yield* ProviderAuthFlow.make({
      instanceId,
      credentialBinding: { owner: "provider", key: elysia.root },
      defaultMethodId: "elysia",
      timeoutMs: 1_800_000,
      methods: Effect.succeed([
        {
          id: "elysia",
          name: "Elysia credentials",
          description: "Initialise the native Elysia CLI and context compression.",
          type: "credentials" as const,
        },
      ]),
      authenticate: Effect.fn("ElysiaDriver.authenticate")(function* (_method, flow) {
        if (!enabled)
          return yield* new ProviderSetupError({
            instanceId,
            operation: "connect",
            detail: "Enable Elysia before configuring credentials.",
          });
        yield* elysia.bootstrap(flow.setMessage);
        yield* flow.setMessage("Reading the native Elysia CLI sign-in…");
        if (yield* elysia.reuseCredentials()) {
          yield* flow.verifying;
          yield* flow.setMessage("Connected using your existing Elysia CLI sign-in.");
          yield* Cache.invalidateAll(capabilities);
          return;
        }
        yield* snapshot.refresh;
        const credentials = yield* Deferred.make<typeof Credentials.Type, ProviderSetupError>();
        yield* flow.setInteraction(
          {
            type: "credentials",
            id: flow.flowId,
            fields: [
              { name: "workspace_id", label: "Workspace ID", secret: false },
              { name: "config_id", label: "Config ID", secret: false },
              { name: "user_id", label: "User ID", secret: false },
              { name: "api_key", label: "API key", secret: true },
            ],
          },
          (response) =>
            Effect.gen(function* () {
              const values = yield* decodeCredentials(
                response.type === "credentials" ? response.values : null,
              ).pipe(
                Effect.mapError(
                  () =>
                    new ProviderSetupError({
                      instanceId,
                      operation: "respond",
                      detail: "Enter valid workspace, config and user IDs, and an API key.",
                    }),
                ),
              );
              yield* Deferred.succeed(credentials, values);
            }),
        );
        const values = yield* Deferred.await(credentials);
        yield* flow.verifying;
        yield* flow.setMessage(
          "Connecting through the native Elysia CLI and preparing compression…",
        );
        yield* elysia.run("--init", values);
        const defaultModel = appDefaultModel ?? config.elysiaDefaultModel;
        const nativeSettings = yield* elysia.readSettings;
        if (nativeSettings._tag === "Some") {
          if (defaultModel && nativeSettings.value.allowed_models.includes(defaultModel)) {
            yield* elysia.run("--model", undefined, [defaultModel]);
          } else {
            yield* serverSettings
              .updateSettings({
                defaultModelSelection: { instanceId, model: nativeSettings.value.model },
              })
              .pipe(
                Effect.catch(() =>
                  Effect.logWarning(
                    "Native Elysia sign-in succeeded; the app default model could not be saved.",
                  ),
                ),
              );
          }
        }
        yield* elysia.refreshEnvironment;
        yield* Cache.invalidateAll(capabilities);
      }, Effect.ensuring(snapshot.refresh)),
      logout: elysia.logout.pipe(
        Effect.andThen(Cache.invalidateAll(capabilities)),
        Effect.andThen(snapshot.refresh),
        Effect.asVoid,
      ),
    });
    return {
      instanceId,
      driverKind: DRIVER_KIND,
      continuationIdentity: { driverKind: DRIVER_KIND, continuationKey: continuationGroupKey },
      displayName: "Elysia",
      accentColor,
      enabled,
      snapshot,
      snapshotForCwd: (workspaceCwd) =>
        !enabled
          ? snapshot.getSnapshot
          : Effect.all([
              snapshot.getSnapshot,
              discoverClaudeSkills(effectiveConfig, workspaceCwd, processEnv),
            ]).pipe(
              Effect.map(([machineSnapshot, skills]) => ({ ...machineSnapshot, skills })),
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path),
            ),
      orchestrationAdapter,
      textGeneration,
      auth,
      elysiaAccountUsage: elysia.accountUsage,
      elysiaModelPricing: elysia.modelPricing,
      invalidateCaches: Cache.invalidateAll(capabilities).pipe(
        Effect.andThen(elysia.refreshEnvironment),
      ),
    } satisfies ProviderInstance;
  }),
};

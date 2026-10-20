import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  ProviderInstanceId,
  ProviderSetupError,
  ServerSettingsError,
} from "@elysiatools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { HttpClient } from "effect/http";
import { ChildProcessSpawner } from "effect/process";
import { vi } from "vite-plus/test";

import * as BackgroundPolicy from "../../background/BackgroundPolicy.ts";
import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import * as ElysiaCli from "../ElysiaCli.ts";
import * as ClaudeProvider from "../ClaudeProvider.ts";
import {
  NoOpProviderEventLoggers as noOpProviderEventLoggers,
  ProviderEventLoggers,
} from "@elysiatools/provider-core/server/ProviderEventLoggers";
import * as ProviderHostLive from "../ProviderHostLive.ts";
import * as ServerSecretStore from "../../auth/ServerSecretStore.ts";
import { makeProviderMaintenanceCapabilities } from "@elysiatools/provider-core/server/maintenanceResolver";
import { ElysiaDriver } from "./ElysiaDriver.ts";
import { ClaudeAgentSdkQueryRunner } from "../../orchestration-v2/Adapters/ClaudeAdapterV2.ts";
import * as IdAllocator from "@elysiatools/provider-core/server/IdAllocator";
import * as ProviderContinuationRequests from "@elysiatools/provider-core/server/ProviderContinuationRequests";
import * as McpProviderSessions from "@elysiatools/provider-core/server/McpProviderSessions";
import * as ProviderLatestVersions from "@elysiatools/provider-core/server/ProviderLatestVersions";

vi.mock("../ElysiaCli.ts", { spy: true });
vi.mock("../ClaudeProvider.ts", { spy: true });

const baseTestLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "elysia-startup-test-",
}).pipe(
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(IdAllocator.layer),
  Layer.provideMerge(ProviderContinuationRequests.layer),
  Layer.provideMerge(McpProviderSessions.layer),
  Layer.provideMerge(ProviderLatestVersions.layer),
  Layer.provideMerge(Layer.mock(ClaudeAgentSdkQueryRunner)({})),
  Layer.provideMerge(ServerSettingsService.layerTest({ enableProviderUpdateChecks: false })),
  Layer.provideMerge(
    Layer.mock(BackgroundPolicy.BackgroundPolicy)({
      shouldRunScopeWork: () => Effect.succeed(false),
    }),
  ),
  Layer.provideMerge(Layer.succeed(ProviderEventLoggers, noOpProviderEventLoggers)),
  Layer.provideMerge(
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make(() => Effect.die("Unexpected HTTP request")),
    ),
  ),
);

const testLayer = ProviderHostLive.layer.pipe(
  Layer.provideMerge(ServerSecretStore.layer),
  Layer.provideMerge(baseTestLayer),
);

it.layer(testLayer)("Elysia startup", (it) => {
  it.effect.each([
    {
      name: "retired default",
      savedDefault: "claude-sonnet-5",
      allowed: ["gpt-6.1-sol"],
      switchModel: false,
      failSync: false,
      rejectModel: false,
    },
    {
      name: "supported default",
      savedDefault: "claude-sonnet-5-5",
      allowed: ["gpt-6.1-sol", "claude-sonnet-5-5"],
      switchModel: true,
      failSync: false,
      rejectModel: false,
    },
    {
      name: "empty native roster",
      savedDefault: "claude-sonnet-5",
      allowed: [],
      switchModel: false,
      failSync: false,
      rejectModel: false,
    },
    {
      name: "unavailable native metadata",
      savedDefault: "claude-sonnet-5",
      allowed: null,
      switchModel: false,
      failSync: false,
      rejectModel: false,
    },
    {
      name: "failed app preference write",
      savedDefault: "claude-sonnet-5",
      allowed: ["gpt-6.1-sol"],
      switchModel: false,
      failSync: true,
      rejectModel: false,
    },
    {
      name: "native model replay rejection",
      savedDefault: "claude-sonnet-5-5",
      allowed: ["gpt-6.1-sol", "claude-sonnet-5-5"],
      switchModel: true,
      failSync: false,
      rejectModel: true,
    },
  ])(
    "applies native default policy after fresh sign-in with $name",
    ({ name, savedDefault, allowed, switchModel, failSync, rejectModel }) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const { stateDir } = yield* ServerConfig;
        const instanceId = ProviderInstanceId.make(`fresh-${name.replaceAll(" ", "-")}`);
        const settingsService = yield* ServerSettingsService;
        yield* settingsService.updateSettings({
          defaultModelSelection: { instanceId, model: savedDefault },
        });
        let ready = false;
        let nativeModel = "gpt-6.1-sol";
        let failedSyncAttempts = 0;
        const operations: string[] = [];
        const initStarted = yield* Deferred.make<void>();
        const finishInit = yield* Deferred.make<void>();
        const cli = vi.spyOn(ElysiaCli, "makeElysiaCli").mockImplementation(() =>
          Effect.succeed({
            root: path.join(stateDir, "fresh-profile"),
            environment: {
              ...process.env,
              CLAUDE_CONFIG_DIR: path.join(stateDir, "fresh-profile/.claude"),
            },
            ready: Effect.sync(() => ready),
            readSettings: Effect.sync(() =>
              ready && allowed !== null
                ? Option.some({ env: {}, model: nativeModel, allowed_models: allowed })
                : Option.none(),
            ),
            modelMetadata: Effect.succeed({}),
            modelPricing: Effect.succeed({}),
            compression: Effect.succeedNone,
            connectionError: Effect.succeed(null),
            requireReady: Effect.succeed(undefined),
            refreshEnvironment: Effect.void,
            run: Effect.fn("test.nativeRun")(function* (
              operation: string,
              _values?: Readonly<Record<string, string>>,
              args: ReadonlyArray<string> = [],
            ) {
              operations.push(operation);
              if (operation === "--init") {
                yield* Deferred.succeed(initStarted, undefined);
                yield* Deferred.await(finishInit);
                ready = true;
              }
              if (operation === "--model") {
                if (rejectModel)
                  return yield* new ProviderSetupError({
                    instanceId,
                    operation: "--model",
                    detail: "Fixture native CLI rejected the model.",
                  });
                nativeModel = args[0]!;
              }
              return undefined;
            }),
            version: Effect.succeed("0.3.10"),
            configurationVersion: Effect.succeed("0.3.10"),
            maintenance: Effect.succeed(
              makeProviderMaintenanceCapabilities({
                provider: ElysiaDriver.driverKind,
                packageName: null,
                updateExecutable: null,
                updateArgs: [],
                updateLockKey: null,
              }),
            ),
            bootstrap: () => Effect.succeed(undefined),
            reuseCredentials: () => Effect.succeed(false),
            accountUsage: Effect.succeed({ status: "unavailable", reason: "cli-unavailable" }),
            restoreCompression: Effect.succeed(undefined),
            logout: Effect.void,
          }),
        );
        const probe = vi
          .spyOn(ClaudeProvider, "checkClaudeProviderStatus")
          .mockImplementation((config, _capabilities, _environment, _cwd, catalog) =>
            ClaudeProvider.makePendingClaudeProvider(config, catalog),
          );
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            cli.mockRestore();
            probe.mockRestore();
          }),
        );
        const instance = yield* ElysiaDriver.create({
          instanceId,
          displayName: undefined,
          environment: [],
          enabled: true,
          config: { ...ElysiaDriver.defaultConfig(), elysiaDefaultModel: savedDefault },
        }).pipe(
          Effect.provideService(ServerSettingsService, {
            ...settingsService,
            updateSettings: (patch) => {
              if (failSync && patch.defaultModelSelection?.model === "gpt-6.1-sol") {
                failedSyncAttempts++;
                return Effect.fail(
                  new ServerSettingsError({
                    settingsPath: "fixture-settings.json",
                    operation: "write-file",
                    cause: new Error("Fixture preference write failed"),
                  }),
                );
              }
              return settingsService.updateSettings(patch);
            },
          }),
          Effect.provideService(
            ChildProcessSpawner.ChildProcessSpawner,
            ChildProcessSpawner.make(() => Effect.die("Unexpected native subprocess")),
          ),
        );
        if (!instance.auth) return yield* Effect.die("Native auth controller missing");
        const auth = instance.auth;
        const started = yield* auth.start("owner");
        const waiting = yield* auth.subscribe("owner").pipe(
          Stream.filter((state) => state.phase === "waiting" || state.phase === "failed"),
          Stream.runHead,
          Effect.map(Option.getOrThrow),
        );
        assert.equal(waiting.phase, "waiting");
        yield* auth.respond!("owner", {
          instanceId,
          flowId: started.flowId!,
          interactionId: waiting.interaction!.id,
          response: {
            type: "credentials",
            values: {
              workspace_id: "fixture",
              config_id: "fixture",
              user_id: "fixture",
              api_key: "fixture-secret",
            },
          },
        });
        yield* Deferred.await(initStarted);
        yield* Deferred.succeed(finishInit, undefined);
        const finished = yield* auth.subscribe("owner").pipe(
          Stream.filter((state) => state.phase === "succeeded" || state.phase === "failed"),
          Stream.runHead,
          Effect.map(Option.getOrThrow),
        );
        assert.equal(finished.phase, rejectModel ? "failed" : "succeeded");
        if (rejectModel) assert.equal(finished.message, "Fixture native CLI rejected the model.");
        assert.equal((yield* instance.snapshot.getSnapshot).auth.status, "authenticated");
        assert.deepEqual(operations, switchModel ? ["--init", "--model"] : ["--init"]);
        assert.equal(nativeModel, switchModel && !rejectModel ? savedDefault : "gpt-6.1-sol");
        assert.deepEqual((yield* settingsService.getSettings).defaultModelSelection, {
          instanceId,
          model: switchModel || allowed === null || failSync ? savedDefault : "gpt-6.1-sol",
        });
        assert.equal(failedSyncAttempts, failSync ? 1 : 0);
        assert.isTrue(ready);
      }).pipe(Effect.scoped),
  );

  it.effect.each([
    { ready: true, savedDefault: "glm-5.3" },
    { ready: false, savedDefault: "glm-5.3" },
    { ready: true, savedDefault: "claude-sonnet-5" },
  ])(
    `opens only a validated profile while checks are pending (ready=$ready, model=$savedDefault)`,
    ({ ready, savedDefault }) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const { stateDir } = yield* ServerConfig;
        const root = path.join(stateDir, "native-profile");
        const versionStarted = yield* Deferred.make<void>();
        const restoreStarted = yield* Deferred.make<void>();
        const cli = vi.spyOn(ElysiaCli, "makeElysiaCli").mockImplementation(() =>
          Effect.succeed({
            root,
            environment: { ...process.env, CLAUDE_CONFIG_DIR: path.join(root, ".claude") },
            ready: Effect.succeed(ready),
            readSettings: Effect.succeedSome({
              env: {},
              model: "glm-5.3",
              allowed_models: ["glm-5.3"],
            }),
            modelMetadata: Effect.succeed({}),
            modelPricing: Effect.succeed({}),
            compression: Effect.succeedSome({ enabled: true, port: 9123 }),
            connectionError: Effect.succeed(ready ? null : "Credentials need setup."),
            requireReady: Effect.succeed(undefined),
            refreshEnvironment: Effect.void,
            run: () => Effect.succeed(undefined),
            version: Effect.succeed("0.3.8"),
            configurationVersion: Effect.succeed("0.3.8"),
            maintenance: Effect.succeed(
              makeProviderMaintenanceCapabilities({
                provider: ElysiaDriver.driverKind,
                packageName: null,
                updateExecutable: null,
                updateArgs: [],
                updateLockKey: null,
              }),
            ),
            bootstrap: () => Effect.succeed(undefined),
            reuseCredentials: () => Effect.succeed(ready),
            accountUsage: Effect.succeed({ status: "unavailable", reason: "cli-unavailable" }),
            restoreCompression: Deferred.succeed(restoreStarted, undefined).pipe(
              Effect.andThen(Effect.never),
            ),
            logout: Effect.void,
          }),
        );
        yield* Effect.addFinalizer(() => Effect.sync(() => cli.mockRestore()));
        const instance = yield* ElysiaDriver.create({
          instanceId: ProviderInstanceId.make("startup"),
          displayName: undefined,
          environment: [],
          enabled: true,
          config: { ...ElysiaDriver.defaultConfig(), elysiaDefaultModel: savedDefault },
        }).pipe(
          Effect.provideService(
            ChildProcessSpawner.ChildProcessSpawner,
            ChildProcessSpawner.make(() =>
              Deferred.succeed(versionStarted, undefined).pipe(Effect.andThen(Effect.never)),
            ),
          ),
        );
        if (savedDefault === "claude-sonnet-5") {
          const settings = yield* ServerSettingsService;
          assert.deepEqual((yield* settings.getSettings).defaultModelSelection, {
            instanceId: ProviderInstanceId.make("startup"),
            model: "glm-5.3",
          });
        }
        const snapshot = yield* instance.snapshot.getSnapshot;
        assert.equal(snapshot.auth.status, ready ? "authenticated" : "unauthenticated");
        assert.equal(snapshot.installed, ready);
        assert.deepEqual(snapshot.elysiaCompression, { enabled: true, port: 9123 });
        const fs = yield* FileSystem.FileSystem;
        const cwd = path.join(stateDir, "agent-workspace");
        const skillPath = path.join(cwd, ".claude", "skills", "env-check", "SKILL.md");
        yield* fs.makeDirectory(path.dirname(skillPath), { recursive: true });
        yield* fs.writeFileString(
          skillPath,
          "---\nname: env-check\ndescription: Check workspace tools\n---\nInspect the workspace.",
        );
        const workspace = yield* instance.snapshotForCwd!(cwd);
        assert.equal(
          workspace.skills?.find((skill) => skill.name === "env-check")?.path,
          skillPath,
        );
        yield* fs.remove(path.dirname(skillPath), { recursive: true });
        assert.equal(
          (yield* instance.snapshotForCwd!(cwd)).skills?.some(
            (skill) => skill.name === "env-check",
          ),
          false,
        );
        yield* Deferred.await(versionStarted);
        if (ready) yield* Deferred.await(restoreStarted);
        else assert.equal(yield* Deferred.isDone(restoreStarted), false);
      }).pipe(Effect.scoped),
  );
});

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { HttpClient } from "effect/http";
import { ChildProcessSpawner } from "effect/process";
import { vi } from "vite-plus/test";

import * as BackgroundPolicy from "../../background/BackgroundPolicy.ts";
import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import * as ElysiaCli from "../ElysiaCli.ts";
import { noOpProviderEventLoggers, ProviderEventLoggers } from "../ProviderEventLoggers.ts";
import { makeProviderMaintenanceCapabilities } from "../providerMaintenance.ts";
import { ElysiaDriver } from "./ElysiaDriver.ts";
import { ClaudeAgentSdkQueryRunner } from "../../orchestration-v2/Adapters/ClaudeAdapterV2.ts";
import * as IdAllocator from "../../orchestration-v2/IdAllocator.ts";
import * as ProviderContinuationRequests from "../../orchestration-v2/ProviderContinuationRequests.ts";

vi.mock("../ElysiaCli.ts", { spy: true });

const testLayer = ServerConfig.layerTest(process.cwd(), { prefix: "elysia-startup-test-" }).pipe(
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(IdAllocator.layer),
  Layer.provideMerge(ProviderContinuationRequests.layer),
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

it.layer(testLayer)("Elysia startup", (it) => {
  it.effect.each([true, false])(
    `opens only a validated profile while Claude and stats checks are pending (%s)`,
    (ready) =>
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
            compression: Effect.succeedSome({ enabled: true, port: 9123 }),
            connectionError: Effect.succeed(ready ? null : "Credentials need setup."),
            requireReady: Effect.succeed(undefined),
            refreshEnvironment: Effect.void,
            run: () => Effect.succeed(undefined),
            version: Effect.succeed("0.3.8"),
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
          config: { ...ElysiaDriver.defaultConfig(), elysiaDefaultModel: "glm-5.3" },
        }).pipe(
          Effect.provideService(
            ChildProcessSpawner.ChildProcessSpawner,
            ChildProcessSpawner.make(() =>
              Deferred.succeed(versionStarted, undefined).pipe(Effect.andThen(Effect.never)),
            ),
          ),
        );
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

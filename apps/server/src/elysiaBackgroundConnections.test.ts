import { assert, describe, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { CONNECTIONS_ENABLED, ThreadId } from "@t3tools/contracts";
import * as RelayClient from "@t3tools/shared/relayClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/process";
import * as ServerSecretStore from "./auth/ServerSecretStore.ts";
import * as ServerEnvironment from "./environment/ServerEnvironment.ts";
import * as ThreadManagement from "./orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "./project/ProjectService.ts";
import * as AgentAwarenessRelay from "./relay/AgentAwarenessRelay.ts";
import * as ManagedEndpointRuntime from "./cloud/ManagedEndpointRuntime.ts";
import { readAgentActivityPublishingActive } from "./cloud/config.ts";
import { remoteSshDeviceHosts } from "./device/localSshDeviceHost.ts";

const secrets = Layer.mock(ServerSecretStore.ServerSecretStore)({
  get: () => Effect.die("Disabled connections must not read saved relay credentials."),
  getOrCreateRandom: () => Effect.die("Disabled connections must not create cloud key material."),
});

describe("Elysia background connections policy", () => {
  it.effect(
    "does not create relay identity, read secrets, subscribe or publish background activity",
    () =>
      Effect.gen(function* () {
        assert.isFalse(CONNECTIONS_ENABLED);
        const relay = yield* AgentAwarenessRelay.make;
        yield* relay.start();
        yield* relay.requestCatchUp();
        yield* relay.publishThread(ThreadId.make("elysia-local-thread"));
        yield* relay.drain;
        const store = yield* ServerSecretStore.ServerSecretStore;
        assert.isFalse(yield* readAgentActivityPublishingActive(store));
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            NodeServices.layer,
            secrets,
            Layer.mock(ServerEnvironment.ServerEnvironment)({}),
            Layer.mock(ThreadManagement.ThreadManagementService)({}),
            Layer.mock(ProjectService.ProjectService)({}),
          ),
        ),
      ),
  );

  it.effect(
    "never installs or launches a tunnel even when a saved runtime configuration is supplied",
    () =>
      Effect.gen(function* () {
        const runtime = yield* ManagedEndpointRuntime.make;
        const config = {
          providerKind: "cloudflare_tunnel",
          connectorToken: "unused-fixture",
        } as const;
        assert.deepEqual(yield* runtime.applyConfig(config), { status: "disabled" });
        yield* runtime.requestRecovery(config);
        assert.lengthOf(yield* Stream.runCollect(runtime.recoveryRequests), 0);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(
              ChildProcessSpawner.ChildProcessSpawner,
              ChildProcessSpawner.make(() =>
                Effect.die("Disabled hosting must not spawn a connector."),
              ),
            ),
            Layer.mock(RelayClient.RelayClient)({
              resolve: Effect.die("Disabled hosting must not discover cloudflared."),
              install: Effect.die("Disabled hosting must not install cloudflared."),
            }),
          ),
        ),
      ),
  );

  it.effect("ignores persisted SSH device hosts before any alias probing or connection", () =>
    remoteSshDeviceHosts([
      { id: "saved-remote", label: "Saved remote", target: "remote-fixture" },
    ]).pipe(
      Effect.tap((hosts) => Effect.sync(() => assert.deepEqual(hosts, []))),
      Effect.provide(NodeServices.layer),
      Effect.provideService(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make(() => Effect.die("Disabled device sync must not execute SSH.")),
      ),
    ),
  );
});

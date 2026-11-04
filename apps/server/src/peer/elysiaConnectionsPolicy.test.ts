import { NodeHttpServer } from "@effect/platform-node";
import * as Context from "effect/Context";
import * as Schema from "effect/Schema";
import { Tool, Toolkit, McpSchema } from "effect/ai";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpBody from "effect/http/HttpBody";
import { OrchestratorMcpFailure } from "@elysiatools/contracts";
import * as McpHttpServer from "../mcp/McpHttpServer.ts";
import * as McpToolAccess from "../mcp/McpToolAccess.ts";
import * as McpToolAccessTestkit from "../mcp/McpToolAccess.testkit.ts";
import * as McpSessionRegistry from "../mcp/McpSessionRegistry.ts";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  CONNECTIONS_ENABLED,
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
} from "@elysiatools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Option from "effect/Option";
import * as SqlClient from "effect/sql/SqlClient";
import * as HttpClient from "effect/http/HttpClient";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as Sqlite from "../persistence/Sqlite.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as McpInvocationContext from "../mcp/McpInvocationContext.ts";
import * as PeerLinks from "./PeerLinks.ts";

it.effect(
  "keeps persisted enabled peer links dormant without reading credentials or starting a network request",
  () =>
    Effect.gen(function* () {
      expect(CONNECTIONS_ENABLED).toBe(false);
      const requests = yield* Ref.make(0);
      const dependencies = Layer.mergeAll(
        Sqlite.layerMemory,
        ServerSettings.layerTest({ linkedEnvironmentsEnabled: true }),
        Layer.mock(ServerSecretStore.ServerSecretStore)({
          get: () => Effect.die("Disabled links must not read credentials"),
        }),
        Layer.mock(ServerEnvironment.ServerEnvironment)({
          getDescriptor: Effect.die("Disabled links must not inspect connection identity"),
        }),
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make(() =>
            Ref.update(requests, (count) => count + 1).pipe(
              Effect.andThen(Effect.die("Disabled links must not contact a peer")),
            ),
          ),
        ),
      );
      yield* Effect.gen(function* () {
        const links = yield* PeerLinks.PeerLinks;
        const sql = yield* SqlClient.SqlClient;
        const environmentId = EnvironmentId.make("saved-peer");
        yield* sql`INSERT INTO peer_environment_links ${sql.insert({ environment_id: environmentId, secret_name: "saved-secret", label: "Saved peer", urls_json: '["https://peer.example.invalid"]', access: "full-access", linked_at: "2026-01-01T00:00:00.000Z", expires_at: "9999-12-31T23:59:59.999Z", last_reached_at: null, last_error: null, fenced: 1 })}`;
        expect(yield* links.enabled).toBe(false);
        expect(yield* links.list).toEqual([]);
        expect(Option.isNone(yield* links.describe("https://peer.example.invalid"))).toBe(true);
        expect(
          yield* links
            .link({
              url: "https://peer.example.invalid",
              pairingCode: "fixture",
              access: "full-access",
            })
            .pipe(Effect.flip),
        ).toMatchObject({ reason: "disabled" });
        expect(yield* links.resolve(environmentId).pipe(Effect.flip)).toMatchObject({
          reason: "disabled",
        });
        expect(yield* sql`SELECT environment_id FROM peer_environment_links`).toHaveLength(1);
        expect(yield* Ref.get(requests)).toBe(0);
      }).pipe(
        Effect.provide(
          PeerLinks.layer.pipe(
            Layer.provideMerge(dependencies),
            Layer.provide(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
          ),
        ),
      );
    }),
);

it.effect(
  "hides and refuses linked-environment MCP tools over the transport despite a persisted enabled setting",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const environmentId = EnvironmentId.make("here");
        const token = "policy-fixture-token";
        const scope: McpInvocationContext.McpThreadInvocationScope = {
          environmentId,
          requestNamespace: token,
          issuedAt: 1,
          thread: {
            threadId: ThreadId.make("thread"),
            providerSessionId: token,
            providerInstanceId: ProviderInstanceId.make("claudeAgent"),
          },
          client: undefined,
          capabilities: new Set(["orchestration"]),
          linkedEnvironments: true,
        };
        const fixture = Toolkit.make(
          Tool.make("links", {
            description: "Lists links",
            success: Schema.Struct({}),
            failure: OrchestratorMcpFailure,
            failureMode: "return",
          }).annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenWhileLinksOff),
        );
        const settingsContext = yield* Layer.build(
          ServerSettings.layerTest({ linkedEnvironmentsEnabled: true }),
        );
        expect(
          (yield* Context.get(settingsContext, ServerSettings.ServerSettingsService).getSettings)
            .linkedEnvironmentsEnabled,
        ).toBe(true);
        const serverLayer = McpHttpServer.layerMcpTransport(
          McpHttpServer.toolkitRegistration(
            fixture,
            McpToolAccess.toLayer(fixture, {
              links: McpToolAccess.reads(() => Effect.die("Disabled links must not be invoked")),
            }),
          ),
        ).pipe(
          Layer.provide(Layer.succeedContext(settingsContext)),
          Layer.provide(McpToolAccessTestkit.liveThreadsLayer),
          Layer.provide(
            Layer.mock(McpSessionRegistry.McpSessionRegistry)({
              resolve: (presented) => Effect.succeed(presented === token ? scope : undefined),
            }),
          ),
        );
        yield* HttpRouter.serve(serverLayer, { disableListenLog: true, disableLogger: true }).pipe(
          Layer.build,
        );
        const httpClient = yield* HttpClient.HttpClient;
        const headers = {
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${token}`,
        };
        const initialize = yield* httpClient.post("/mcp", {
          headers,
          body: HttpBody.text(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "initialize",
              params: {
                protocolVersion: "2025-06-18",
                capabilities: {},
                clientInfo: { name: "policy-probe", version: "1" },
              },
            }),
            "application/json",
          ),
        });
        const rpc = (method: string, params: object) =>
          httpClient
            .post("/mcp", {
              headers: {
                ...headers,
                "mcp-session-id": initialize.headers["mcp-session-id"]!,
                "mcp-protocol-version": "2025-06-18",
              },
              body: HttpBody.text(
                JSON.stringify({ jsonrpc: "2.0", id: 2, method, params }),
                "application/json",
              ),
            })
            .pipe(Effect.flatMap((response) => response.json));
        expect(yield* rpc("tools/list", {})).toMatchObject({ result: { tools: [] } });
        expect(yield* rpc("tools/call", { name: "links", arguments: {} })).toMatchObject({
          error: { message: expect.stringContaining("not found") },
        });
      }),
    ).pipe(Effect.provide(NodeHttpServer.layerTest)),
);

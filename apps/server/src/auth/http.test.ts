import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  AuthTokenExchangeGrantType,
  AuthEnvironmentBootstrapTokenType,
  AuthAccessTokenType,
  EnvironmentHttpApi,
} from "@elysiatools/contracts";
import { expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as Etag from "effect/http/Etag";
import * as HttpPlatform from "effect/http/HttpPlatform";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpRouter from "effect/http/HttpRouter";

import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as EnvironmentAuth from "./EnvironmentAuth.ts";
import * as ServerSecretStore from "./ServerSecretStore.ts";
import * as AuthHttp from "./http.ts";

const DEV_TOKEN = "reusable-dev-auth-token-that-is-long-enough";
const unusedSecretStore = ServerSecretStore.ServerSecretStore.of({
  get: () => Effect.succeedNone,
  set: () => Effect.void,
  create: () => Effect.void,
  getOrCreateRandom: () => Effect.die("Not used by these routes."),
  remove: () => Effect.void,
});
class AuthTestApi extends HttpApi.make("environment").add(EnvironmentHttpApi.groups.auth) {}

const layerConfig = (overrides?: Partial<ServerConfig.ServerConfig["Service"]>) =>
  Layer.effect(
    ServerConfig.ServerConfig,
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      return {
        ...config,
        mode: "web",
        devUrl: new URL("http://127.0.0.1:5173"),
        devAuthToken: Redacted.make(DEV_TOKEN),
        ...overrides,
      } satisfies ServerConfig.ServerConfig["Service"];
    }),
  ).pipe(
    Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "elysia-auth-http-test-" })),
  );

const layerRoutes = (overrides?: Partial<ServerConfig.ServerConfig["Service"]>) => {
  const config = layerConfig(overrides);
  const layerEnvironmentAuth = EnvironmentAuth.layer.pipe(
    Layer.provide(SqlitePersistence.layerMemory),
    Layer.provide(ServerSecretStore.layer),
    Layer.provide(ServerEnvironment.layerIdentity),
    Layer.provide(config),
  );
  return HttpApiBuilder.layer(AuthTestApi).pipe(
    Layer.provide(AuthHttp.layer),
    Layer.provide(AuthHttp.layerAuthenticatedAuth),
    Layer.provideMerge(layerEnvironmentAuth),
    Layer.provide(config),
    Layer.provideMerge(
      HttpPlatform.layer.pipe(
        Layer.provideMerge(NodeServices.layer),
        Layer.provideMerge(Etag.layerWeak),
      ),
    ),
    Layer.provide(NodeServices.layer),
  );
};

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const postJson = (path: string, body: unknown, headers?: Readonly<Record<string, string>>) =>
  new Request(`http://127.0.0.1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: encodeJson(body),
  });

it.effect("sets the selected browser session cookies through the HTTP route", () =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const requestContext = Context.make(Crypto.Crypto, crypto).pipe(
      Context.add(ServerSecretStore.ServerSecretStore, unusedSecretStore),
    );
    return yield* Effect.acquireUseRelease(
      Effect.sync(
        () =>
          [
            HttpRouter.toWebHandler(layerRoutes(), { disableLogger: true }),
            HttpRouter.toWebHandler(layerRoutes(), { disableLogger: true }),
          ] as const,
      ),
      ([environmentA, environmentB]) =>
        Effect.tryPromise(async () => {
          const devResponse = await environmentA.handler(
            postJson("/api/auth/browser-session", { credential: DEV_TOKEN }),
            requestContext,
          );
          expect(devResponse.status).toBe(200);
          const retiredScopeResponse = await environmentA.handler(
            new Request("http://127.0.0.1/oauth/token", {
              method: "POST",
              body: new URLSearchParams({
                grant_type: AuthTokenExchangeGrantType,
                subject_token: DEV_TOKEN,
                subject_token_type: AuthEnvironmentBootstrapTokenType,
                requested_token_type: AuthAccessTokenType,
                scope: "review:write",
              }),
            }),
            requestContext,
          );
          expect(retiredScopeResponse.status).toBe(400);
          expect(await retiredScopeResponse.json()).toMatchObject({ reason: "invalid_scope" });

          const devCookies = devResponse.headers.getSetCookie();
          const devCookie = devCookies.find((cookie) => cookie.startsWith("elysia_dev_session_"));
          expect(devCookie).toContain("HttpOnly");
          expect(devCookie).not.toContain("Secure");
          expect(devCookie).toContain(`=${DEV_TOKEN};`);
          expect(devCookies).toContainEqual(
            expect.stringMatching(/^elysia_session_[^=]*=;.*Max-Age=0/),
          );
          const devCookieHeader = devCookie?.split(";", 1)[0] ?? "";
          const environmentBSession = await environmentB.handler(
            new Request("http://127.0.0.1/api/auth/session", {
              headers: { cookie: devCookieHeader },
            }),
            requestContext,
          );
          expect(environmentBSession.status).toBe(200);
          expect(await environmentBSession.json()).toMatchObject({ authenticated: true });
          const oldDevHeader = devCookieHeader.replace(/^elysia_dev_session_/, "t3_dev_session_");
          const migratedDev = await environmentA.handler(
            new Request("http://127.0.0.1/api/auth/session", { headers: { cookie: oldDevHeader } }),
            requestContext,
          );
          expect(await migratedDev.json()).toMatchObject({ authenticated: true });
          const migratedDevCookies = migratedDev.headers.getSetCookie();
          expect(migratedDevCookies).toHaveLength(1);
          expect(migratedDevCookies[0]?.split(";", 1)[0]).toBe(devCookieHeader);
          expect(migratedDevCookies[0]).toContain("HttpOnly");
          expect(migratedDev.headers.get("cache-control")).toBe("no-store");

          const pairingResponse = await environmentA.handler(
            postJson(
              "/api/auth/pairing-token",
              { scopes: ["orchestration:read"] },
              { cookie: devCookieHeader },
            ),
            requestContext,
          );
          expect(pairingResponse.status).toBe(200);
          const pairing = (await pairingResponse.json()) as { credential: string };
          const restrictedResponse = await environmentA.handler(
            postJson("/api/auth/browser-session", { credential: pairing.credential }),
            requestContext,
          );
          expect(restrictedResponse.status).toBe(200);
          const restrictedCookies = restrictedResponse.headers.getSetCookie();
          expect(restrictedCookies).toHaveLength(1);
          expect(restrictedCookies[0]).toMatch(/^elysia_session_/);
          expect(restrictedCookies[0]).not.toContain("elysia_dev_session_");
          const restrictedWithLegacyDev = await environmentA.handler(
            new Request("http://127.0.0.1/api/auth/session", {
              headers: { cookie: `${restrictedCookies[0]?.split(";", 1)[0]}; ${oldDevHeader}` },
            }),
            requestContext,
          );
          expect(await restrictedWithLegacyDev.json()).toMatchObject({
            authenticated: true,
            scopes: ["orchestration:read"],
          });
          expect(restrictedWithLegacyDev.headers.getSetCookie()).toHaveLength(0);

          for (const request of [
            postJson(
              "/api/auth/browser-session",
              { credential: DEV_TOKEN },
              {
                "x-forwarded-proto": "https",
              },
            ),
            new Request("https://127.0.0.1/api/auth/browser-session", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: encodeJson({ credential: DEV_TOKEN }),
            }),
          ]) {
            const secureResponse = await environmentA.handler(request, requestContext);
            expect(secureResponse.status).toBe(200);
            for (const cookie of secureResponse.headers.getSetCookie()) {
              expect(cookie).toContain("Secure");
              expect(cookie).toContain("HttpOnly");
              expect(cookie).toContain("SameSite=Lax");
            }
          }
        }),
      ([environmentA, environmentB]) =>
        Effect.promise(() => Promise.all([environmentA.dispose(), environmentB.dispose()])),
    );
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("migrates a legacy browser cookie without changing its session", () =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const context = Context.make(Crypto.Crypto, crypto).pipe(
      Context.add(ServerSecretStore.ServerSecretStore, unusedSecretStore),
    );
    return yield* Effect.acquireUseRelease(
      Effect.sync(() =>
        HttpRouter.toWebHandler(
          layerRoutes({
            host: "0.0.0.0",
            devUrl: undefined,
            devAuthToken: undefined,
            desktopBootstrapToken: "legacy-cookie-test-bootstrap",
          }),
          { disableLogger: true },
        ),
      ),
      (environment) =>
        Effect.tryPromise(async () => {
          const response = await environment.handler(
            postJson("/api/auth/browser-session", {
              credential: "legacy-cookie-test-bootstrap",
            }),
            context,
          );
          expect(response.status).toBe(200);
          const cookie = response.headers.getSetCookie()[0]?.split(";", 1)[0] ?? "";
          const token = cookie.slice(cookie.indexOf("=") + 1);
          expect(token).not.toBe("");
          const scopedName = cookie.slice(0, cookie.indexOf("="));
          for (const legacyName of [
            scopedName.replace(/^elysia_/, "t3_"),
            "t3_session",
            "elysia_session",
          ]) {
            for (const protocol of ["http", "https"]) {
              const migrated = await environment.handler(
                new Request(`${protocol}://127.0.0.1/api/auth/session`, {
                  headers: { cookie: `${legacyName}=${token}` },
                }),
                context,
              );
              expect(migrated.status).toBe(200);
              expect(await migrated.json()).toMatchObject({
                authenticated: true,
                sessionMethod: "browser-session-cookie",
              });
              const cookies = migrated.headers.getSetCookie();
              expect(cookies).toHaveLength(1);
              expect(cookies[0]?.split(";", 1)[0]).toBe(cookie);
              expect(cookies[0]).toContain("HttpOnly");
              expect(cookies[0]).toContain("SameSite=Lax");
              expect(cookies[0]?.includes("Secure")).toBe(protocol === "https");
              expect(migrated.headers.get("cache-control")).toBe("no-store");
            }
            const rejected = await environment.handler(
              new Request("http://127.0.0.1/api/auth/session", {
                headers: { cookie: `${legacyName}=invalid` },
              }),
              context,
            );
            expect(await rejected.json()).toMatchObject({ authenticated: false });
            expect(rejected.headers.getSetCookie()).toHaveLength(0);
          }
        }),
      (environment) => Effect.promise(() => environment.dispose()),
    );
  }).pipe(Effect.provide(NodeServices.layer)),
);

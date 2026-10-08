// @effect-diagnostics preferSchemaOverJson:off - Native HTTP fixtures deliberately include unknown fields.
import { assert, it } from "@effect/vitest";
import { describe } from "vite-plus/test";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@elysiatools/contracts";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http";
import { readElysiaStats } from "./ElysiaStats.ts";

const provider = (overrides: Partial<ServerProvider> = {}): ServerProvider => ({
  instanceId: ProviderInstanceId.make("claudeAgent"),
  driver: ProviderDriverKind.make("claudeAgent"),
  enabled: true,
  installed: true,
  version: "0.3.8",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: "2026-10-01T00:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
  elysiaCompression: { enabled: true, port: 9123 },
  ...overrides,
});

const native = {
  display_session: {
    requests: 12,
    tokens_saved: 3400,
    savings_percent: 25,
    compression_savings_usd: 0.17,
  },
  persistent_savings: {
    lifetime: { requests: 50, tokens_saved: 9900, compression_savings_usd: 1.25 },
  },
  recent_requests: [{ prompt: "private prompt", api_key: "private key" }],
  credentials: { token: "private token" },
};

describe("native Elysia stats", () => {
  it.effect(
    "reads only the selected native loopback port and returns numeric savings without diagnostics",
    () =>
      Effect.gen(function* () {
        const urls: string[] = [];
        const http = HttpClient.make((request) =>
          Effect.gen(function* () {
            urls.push(request.url);
            assert.isUndefined(request.headers.authorization);
            assert.isUndefined(request.headers.cookie);
            const options = Context.getOrUndefined(
              yield* Effect.context<never>(),
              FetchHttpClient.RequestInit,
            );
            assert.deepEqual(options, { redirect: "error", credentials: "omit" });
            return HttpClientResponse.fromWeb(request, Response.json(native));
          }),
        );
        const selected = provider({
          instanceId: ProviderInstanceId.make("elysia_work"),
          elysiaCompression: { enabled: true, port: 9234 },
        });
        const result = yield* readElysiaStats([provider(), selected], selected.instanceId).pipe(
          Effect.provideService(HttpClient.HttpClient, http),
        );
        assert.deepEqual(urls, ["http://127.0.0.1:9234/stats"]);
        assert.deepEqual(result, {
          status: "available",
          session: { requests: 12, tokensSaved: 3400, savingsPercent: 25, savingsUsd: 0.17 },
          lifetime: { requests: 50, tokensSaved: 9900, savingsUsd: 1.25 },
        });
        assert.notInclude(JSON.stringify(result), "private");
      }),
  );

  it.effect("does not contact disabled, unauthenticated, foreign or missing native providers", () =>
    Effect.gen(function* () {
      const http = HttpClient.make(() => Effect.die("An unavailable provider must not be fetched"));
      for (const candidate of [
        provider({ enabled: false }),
        provider({ installed: false }),
        provider({ auth: { status: "unauthenticated" } }),
        provider({ driver: ProviderDriverKind.make("codex") }),
      ]) {
        assert.deepEqual(
          yield* readElysiaStats([candidate]).pipe(
            Effect.provideService(HttpClient.HttpClient, http),
          ),
          {
            status: "unavailable",
            reason: "not-connected",
          },
        );
      }
      assert.deepEqual(
        yield* readElysiaStats([provider()], ProviderInstanceId.make("missing")).pipe(
          Effect.provideService(HttpClient.HttpClient, http),
        ),
        {
          status: "unavailable",
          reason: "not-connected",
        },
      );
    }),
  );

  it.effect("does not contact disabled compression or invalid native ports", () =>
    Effect.gen(function* () {
      const http = HttpClient.make(() => Effect.die("An invalid native port must not be fetched"));
      for (const port of [0, 80, 65536, NaN, Infinity, 9123.5]) {
        assert.deepEqual(
          yield* readElysiaStats([provider({ elysiaCompression: { enabled: true, port } })]).pipe(
            Effect.provideService(HttpClient.HttpClient, http),
          ),
          {
            status: "unavailable",
            reason: "proxy-unavailable",
          },
        );
      }
      assert.deepEqual(
        yield* readElysiaStats([
          provider({ elysiaCompression: { enabled: false, port: 9123 } }),
        ]).pipe(Effect.provideService(HttpClient.HttpClient, http)),
        {
          status: "unavailable",
          reason: "compression-disabled",
        },
      );
    }),
  );

  it.effect(
    "keeps missing pricing and lifetime values unavailable without manufacturing totals",
    () =>
      Effect.gen(function* () {
        for (const body of [
          { display_session: { requests: 0, tokens_saved: 0, savings_percent: 0 } },
          { ...native, litellm_available: false },
        ]) {
          const http = HttpClient.make((request) =>
            Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(body))),
          );
          const result = yield* readElysiaStats([provider()]).pipe(
            Effect.provideService(HttpClient.HttpClient, http),
          );
          assert.strictEqual(result.status, "available");
          if (result.status !== "available") return;
          assert.isNull(result.session.savingsUsd);
          if (result.lifetime) assert.isNull(result.lifetime.savingsUsd);
          else assert.isNull(result.lifetime);
        }
      }),
  );

  it.effect("rejects malformed, non-finite or out-of-range native metrics", () =>
    Effect.gen(function* () {
      const bodies = [
        {},
        { ...native, display_session: { ...native.display_session, requests: -1 } },
        { ...native, display_session: { ...native.display_session, tokens_saved: 1.5 } },
        {
          ...native,
          display_session: { ...native.display_session, tokens_saved: Number.MAX_SAFE_INTEGER + 1 },
        },
        { ...native, display_session: { ...native.display_session, savings_percent: 101 } },
        {
          ...native,
          display_session: { ...native.display_session, compression_savings_usd: -0.1 },
        },
      ].map((body) => JSON.stringify(body));
      bodies.push(
        JSON.stringify(native).replace('"savings_percent":25', '"savings_percent":1e309'),
      );
      for (const body of bodies) {
        const http = HttpClient.make((request) =>
          Effect.succeed(HttpClientResponse.fromWeb(request, new Response(body))),
        );
        assert.deepEqual(
          yield* readElysiaStats([provider()]).pipe(
            Effect.provideService(HttpClient.HttpClient, http),
          ),
          {
            status: "unavailable",
            reason: "invalid-data",
          },
        );
      }
    }),
  );

  it.effect(
    "reports an unavailable proxy rather than displaying a failed or redirected response",
    () =>
      Effect.gen(function* () {
        for (const status of [302, 404, 500]) {
          const http = HttpClient.make((request) =>
            Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status }))),
          );
          assert.deepEqual(
            yield* readElysiaStats([provider()]).pipe(
              Effect.provideService(HttpClient.HttpClient, http),
            ),
            {
              status: "unavailable",
              reason: "proxy-unavailable",
            },
          );
        }
      }),
  );

  it.effect("rejects an oversized native stats response instead of forwarding diagnostics", () =>
    Effect.gen(function* () {
      const http = HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(request, new Response("x".repeat(8 * 1024 * 1024 + 1))),
        ),
      );
      assert.deepEqual(
        yield* readElysiaStats([provider()]).pipe(
          Effect.provideService(HttpClient.HttpClient, http),
        ),
        { status: "unavailable", reason: "invalid-data" },
      );
    }),
  );

  it.effect("bounds unavailable native reads without starting or restarting the proxy", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const http = HttpClient.make(() =>
        Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
      );
      const pending = yield* readElysiaStats([provider()]).pipe(
        Effect.provideService(HttpClient.HttpClient, http),
        Effect.forkChild,
      );
      yield* Deferred.await(started);
      yield* TestClock.adjust("3 seconds");
      assert.deepEqual(yield* Fiber.join(pending), {
        status: "unavailable",
        reason: "proxy-unavailable",
      });
    }),
  );
});

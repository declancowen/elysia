import { expect, it } from "@effect/vitest";
import { UPSTREAM_ANALYTICS_ENABLED } from "@elysiatools/contracts";
import { layerRemoteHttpClient } from "@elysiatools/client-runtime/rpc";
import { withRelayClientTracing } from "@elysiatools/shared/relayTracing";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { vi } from "vite-plus/test";
import * as Tracing from "./tracing";

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        observability: {
          tracesUrl: "https://telemetry.example.test/v1/traces",
          tracesDataset: "fixture",
          tracesToken: "fixture-token",
        },
      },
    },
  },
}));

it.effect(
  "never configures or exports relay telemetry with bundled or directly supplied credentials",
  () => {
    expect(UPSTREAM_ANALYTICS_ENABLED).toBe(false);
    expect(Tracing.resolveTracingConfig()).toBeNull();
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(null, { status: 202 }));
    const layer = Tracing.layerFromConfig(
      {
        tracesUrl: "https://telemetry.example.test/v1/traces",
        tracesDataset: "fixture",
        tracesToken: "fixture-token",
      },
      { appVariant: "test" },
    ).pipe(Layer.provide(layerRemoteHttpClient(fetchFn)));
    return Effect.void.pipe(
      Effect.withSpan("mobile.disabled-relay"),
      withRelayClientTracing,
      Effect.provide(layer),
      Effect.scoped,
      Effect.andThen(Effect.sync(() => expect(fetchFn).not.toHaveBeenCalled())),
    );
  },
);

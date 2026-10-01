import {
  ElysiaStatsAmount,
  ElysiaStatsCount,
  ElysiaStatsPercent,
  isEnabledProviderDriver,
  type ElysiaStatsSnapshot,
  type ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as Schema from "effect/Schema";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http";

const NativeTotals = Schema.Struct({
  requests: ElysiaStatsCount,
  tokens_saved: ElysiaStatsCount,
  compression_savings_usd: Schema.optional(ElysiaStatsAmount),
});
// /stats also contains request diagnostics. Decode only the CLI's documented savings totals.
const NativeStats = Schema.fromJsonString(
  Schema.Struct({
    display_session: Schema.Struct({
      ...NativeTotals.fields,
      savings_percent: ElysiaStatsPercent,
    }),
    persistent_savings: Schema.optional(Schema.Struct({ lifetime: Schema.optional(NativeTotals) })),
    litellm_available: Schema.optional(Schema.Boolean),
  }),
);
const NativePort = Schema.Int.check(Schema.isBetween({ minimum: 1024, maximum: 65535 }));
const isNativePort = Schema.is(NativePort);
const decodeNativeStats = Schema.decodeEffect(NativeStats);
class ElysiaStatsResponseLimitError extends Data.TaggedError("ElysiaStatsResponseLimitError")<{
  readonly limit: number;
}> {}

export const readElysiaStats = Effect.fnUntraced(function* (
  providers: ReadonlyArray<ServerProvider>,
  instanceId?: ProviderInstanceId,
): Effect.fn.Return<ElysiaStatsSnapshot, never, HttpClient.HttpClient> {
  const provider = providers.find(
    (candidate) =>
      candidate.driver === "claudeAgent" &&
      isEnabledProviderDriver(candidate.driver) &&
      candidate.enabled &&
      candidate.installed &&
      candidate.auth.status === "authenticated" &&
      (instanceId === undefined || candidate.instanceId === instanceId),
  );
  if (!provider) return { status: "unavailable", reason: "not-connected" };
  const compression = provider.elysiaCompression;
  if (!compression?.enabled) return { status: "unavailable", reason: "compression-disabled" };
  if (!isNativePort(compression.port))
    return { status: "unavailable", reason: "proxy-unavailable" };

  const client = yield* HttpClient.HttpClient;
  return yield* client.get(`http://127.0.0.1:${compression.port}/stats`).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap((response) => response.text),
    Effect.filterOrFail(
      (text) => text.length <= 8 * 1024 * 1024,
      () => new ElysiaStatsResponseLimitError({ limit: 8 * 1024 * 1024 }),
    ),
    Effect.flatMap(decodeNativeStats),
    Effect.map((native): ElysiaStatsSnapshot => {
      const totals = (value: typeof NativeTotals.Type) => ({
        requests: value.requests,
        tokensSaved: value.tokens_saved,
        savingsUsd:
          native.litellm_available === false ? null : (value.compression_savings_usd ?? null),
      });
      const lifetime = native.persistent_savings?.lifetime;
      return {
        status: "available",
        session: {
          ...totals(native.display_session),
          savingsPercent: native.display_session.savings_percent,
        },
        lifetime: lifetime ? totals(lifetime) : null,
      };
    }),
    // A dashboard read never forwards credentials or follows redirects away from the native proxy.
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error", credentials: "omit" }),
    Effect.timeout("3 seconds"),
    Effect.catch((error) =>
      Effect.succeed({
        status: "unavailable" as const,
        reason:
          Schema.isSchemaError(error) || error instanceof ElysiaStatsResponseLimitError
            ? ("invalid-data" as const)
            : ("proxy-unavailable" as const),
      }),
    ),
    Effect.withTracerEnabled(false),
  );
});

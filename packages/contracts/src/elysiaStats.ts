import * as Schema from "effect/Schema";
import { NonNegativeInt } from "./baseSchemas.ts";

export const ElysiaStatsCount = NonNegativeInt.check(
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
);
export const ElysiaStatsAmount = Schema.Number.check(
  Schema.isFinite(),
  Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
);
export const ElysiaStatsPercent = Schema.Number.check(
  Schema.isFinite(),
  Schema.isBetween({ minimum: 0, maximum: 100 }),
);

export const ElysiaStatsTotals = Schema.Struct({
  requests: ElysiaStatsCount,
  tokensSaved: ElysiaStatsCount,
  savingsUsd: Schema.NullOr(ElysiaStatsAmount),
});
export type ElysiaStatsTotals = typeof ElysiaStatsTotals.Type;

export const ElysiaStatsSnapshot = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("available"),
    session: Schema.Struct({
      ...ElysiaStatsTotals.fields,
      savingsPercent: ElysiaStatsPercent,
    }),
    lifetime: Schema.NullOr(ElysiaStatsTotals),
  }),
  Schema.Struct({
    status: Schema.Literal("unavailable"),
    reason: Schema.Literals([
      "not-connected",
      "compression-disabled",
      "proxy-unavailable",
      "invalid-data",
    ]),
  }),
]);
export type ElysiaStatsSnapshot = typeof ElysiaStatsSnapshot.Type;

export const ElysiaAccountUsageSnapshot = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("available"),
    usedUsd: ElysiaStatsAmount,
    limitUsd: ElysiaStatsAmount.check(Schema.isGreaterThan(0)),
    accountStatus: Schema.NullOr(Schema.String.check(Schema.isMaxLength(80))),
    resetPeriod: Schema.NullOr(Schema.String.check(Schema.isMaxLength(80))),
    expiresOn: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))),
  }),
  Schema.Struct({
    status: Schema.Literal("unavailable"),
    reason: Schema.Literals(["not-connected", "cli-unavailable", "invalid-data"]),
  }),
]);
export type ElysiaAccountUsageSnapshot = typeof ElysiaAccountUsageSnapshot.Type;

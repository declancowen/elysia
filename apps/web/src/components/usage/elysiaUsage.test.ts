import { expect, it } from "vite-plus/test";
import { UsageDay, type UsageBucket } from "@t3tools/contracts";
import { elysiaUsagePeriods, elysiaUsageRange } from "./elysiaUsage";
const bucket = (day: string, costUsd: number): UsageBucket => ({
  day: UsageDay.make(day),
  provider: "claude",
  model: "deepseek-v4.1-flash",
  costUsd,
  totals: {
    uncachedInputTokens: 5,
    cachedInputTokens: 3,
    cacheCreationTokens: 2,
    outputTokens: 4,
    reasoningTokens: 2,
  },
  cacheSavingsUsd: 0,
  costSource: "providerReported",
  records: 1,
  unpricedRecords: 0,
  sessions: 1,
});
it("groups dated native costs by calendar periods without double-counting reasoning", () => {
  const rows = [bucket("2026-09-30", 2), bucket("2026-10-01", 3), bucket("2026-10-05", 4)];
  expect(
    elysiaUsagePeriods(rows, "week").map((row) => [row.day, row.costUsd, row.totalTokens]),
  ).toEqual([
    ["2026-09-28", 5, 28],
    ["2026-10-05", 4, 14],
  ]);
  expect(elysiaUsagePeriods(rows, "month").map((row) => row.costUsd)).toEqual([2, 7]);
  expect(elysiaUsagePeriods(rows, "year").map((row) => row.costUsd)).toEqual([9]);
  expect(elysiaUsagePeriods([], "day")).toEqual([]);
});
it("includes today in date windows spanning month boundaries", () => {
  expect(elysiaUsageRange(7, new Date(2026, 9, 4, 12))).toEqual({
    since: "2026-09-28",
    until: "2026-10-04",
  });
});

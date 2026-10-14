import { expect, it } from "vite-plus/test";
import { UsageDay, type UsageBucket } from "@elysiatools/contracts";
import { elysiaUsageModelName, elysiaUsagePeriods, elysiaUsageRange } from "./elysiaUsage";

it.each([
  ["us.anthropic.claude-sonnet-5", "Claude Sonnet 5"],
  ["us.anthropic.claude-haiku-4-5-20251001-v1:0", "Claude Haiku 4.5"],
  ["global.anthropic.claude-opus-4-6-v1:0", "Claude Opus 4.6"],
  ["claude-sonnet-4-20250514", "Claude Sonnet 4"],
  ["DeepSeek-V4.1-Flash", "DeepSeek V4.1 Flash"],
  ["custom/model-v2", "custom/model-v2"],
  ["my-model-20251001-v1:0", "my-model-20251001-v1:0"],
])("uses readable usage labels for %s without changing unknown IDs", (model, expected) => {
  expect(elysiaUsageModelName(model)).toBe(expected);
});

it("prefers configured names and aliases for usage model labels", () => {
  const catalog = [{ slug: "claude-haiku-4-5", name: "Fast model", aliases: ["gateway-fast"] }];
  expect(elysiaUsageModelName("us.anthropic.claude-haiku-4-5-20251001-v1:0", catalog)).toBe(
    "Fast model",
  );
  expect(elysiaUsageModelName("gateway-fast", catalog)).toBe("Fast model");
  expect(
    elysiaUsageModelName("us.anthropic.claude-haiku-4-5-20251001-v1:0", [
      ...catalog,
      { slug: "us.anthropic.claude-haiku-4-5-20251001-v1:0", name: "Company profile" },
    ]),
  ).toBe("Company profile");
});
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

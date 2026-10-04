import { makeWindow } from "@t3tools/shared/usageFormat";
import type { UsageBucket } from "@t3tools/contracts";
import type { DailyTotals } from "@t3tools/shared/usageMerge";

export type ElysiaUsageResolution = "day" | "week" | "month" | "year";

/** Calendar buckets follow the server's reporting day, without shifting time zones twice. */
export function elysiaUsagePeriods(
  buckets: readonly UsageBucket[],
  resolution: ElysiaUsageResolution,
): DailyTotals[] {
  const periods = new Map<string, { costUsd: number; totalTokens: number }>();
  for (const bucket of buckets) {
    let day: string = bucket.day;
    if (resolution === "month") day = `${day.slice(0, 7)}-01`;
    else if (resolution === "year") day = `${day.slice(0, 4)}-01-01`;
    else if (resolution === "week") {
      const date = new Date(`${day}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      day = date.toISOString().slice(0, 10);
    }
    const totals = periods.get(day) ?? { costUsd: 0, totalTokens: 0 };
    totals.costUsd += bucket.costUsd;
    const tokens = bucket.totals;
    totals.totalTokens +=
      tokens.uncachedInputTokens +
      tokens.cachedInputTokens +
      tokens.cacheCreationTokens +
      tokens.outputTokens;
    periods.set(day, totals);
  }
  return [...periods]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, totals]) => ({
      day,
      ...totals,
      byProvider: new Map([["claude", totals]]),
    }));
}

export function elysiaUsageRange(days: number, now: Date) {
  const window = makeWindow(days, now);
  return { since: String(window.sinceDay), until: String(window.untilDay) };
}

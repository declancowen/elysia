import { makeWindow } from "@elysiatools/shared/usageFormat";
import type { ServerProviderModel, UsageBucket } from "@elysiatools/contracts";
import type { DailyTotals } from "@elysiatools/shared/usageMerge";
import { formatModelSlugName } from "@elysiatools/shared/model";

export type ElysiaUsageResolution = "day" | "week" | "month" | "year";

export function elysiaUsageModelName(
  model: string,
  catalog: readonly Pick<ServerProviderModel, "slug" | "name" | "aliases">[] = [],
): string {
  const slug = model.replace(/^(?:(?:us|eu|apac|global)\.)?anthropic\./i, "");
  // Native Claude usage can include a deployment date and Bedrock revision.
  const name = /^claude-(?:opus|sonnet|haiku|fable)-\d/i.test(slug)
    ? slug.replace(/(?:-\d{8})?(?:-v\d+(?::\d+)?)?$/, "")
    : slug;
  const known =
    catalog.find(
      (entry) =>
        entry.slug.toLowerCase() === model.toLowerCase() ||
        entry.aliases?.some((alias) => alias.toLowerCase() === model.toLowerCase()),
    ) ?? catalog.find((entry) => entry.slug.toLowerCase() === name.toLowerCase());
  if (known) return known.name;
  if (/^deepseek-v\d/i.test(name)) {
    return name
      .split("-")
      .map((part, index) => (index === 0 ? "DeepSeek" : part[0]!.toUpperCase() + part.slice(1)))
      .join(" ");
  }
  return formatModelSlugName(name);
}

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

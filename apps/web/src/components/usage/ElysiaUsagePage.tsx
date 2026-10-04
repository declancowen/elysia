import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import { useContext, useEffect, useState } from "react";
import { makeWindow } from "@t3tools/shared/usageFormat";
import { UsageDay, isEnabledProviderDriver } from "@t3tools/contracts";
import type { ElysiaStatsTotals } from "@t3tools/contracts";

import { useEscapeToGoBack } from "../../hooks/useNavigateBack";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { primaryServerProvidersAtom, serverEnvironment } from "../../state/server";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { Select, SelectTrigger, SelectPopup, SelectItem, SelectGroup } from "../ui/select";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { UsageProviderChart } from "./UsageProviderChart";
import { elysiaUsagePeriods, elysiaUsageRange, type ElysiaUsageResolution } from "./elysiaUsage";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageContainer } from "../WorkspacePageContainer";

const numberFormat = new Intl.NumberFormat();
const savingsFormat = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const unavailableMessages = {
  "not-connected": "Connect Elysia in Providers to view your compression savings.",
  "compression-disabled": "Compression is disabled in your Elysia CLI.",
  "proxy-unavailable":
    "Compression stats are unavailable. Elysia starts the local proxy automatically. Check setup in Providers.",
  "invalid-data":
    "Your Elysia CLI could not report supported compression stats. Check for a CLI update in Providers, Statistics will load automatically.",
};

function SavingsSummary({
  title,
  totals,
  savingsPercent,
}: {
  title: string;
  totals: ElysiaStatsTotals;
  savingsPercent?: number;
}) {
  const values = [
    ["Requests", numberFormat.format(totals.requests)],
    ["Tokens saved", numberFormat.format(totals.tokensSaved)],
    [
      "Estimated savings",
      totals.savingsUsd === null ? "Unavailable" : savingsFormat.format(totals.savingsUsd),
    ],
    ...(savingsPercent === undefined ? [] : [["Tokens reduced", `${savingsPercent}%`]]),
  ];
  return (
    <section className="space-y-3">
      <h2 className="text-base font-medium">{title}</h2>
      <dl className="grid gap-3 sm:grid-cols-2">
        {values.map(([label, value]) => (
          <div
            key={label}
            className="min-w-0 rounded-xl workspace-panel-outline bg-background px-5 py-4"
          >
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-2 text-xl font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ElysiaUsagePage() {
  useEscapeToGoBack();
  const registry = useContext(RegistryContext);
  const environmentId = usePrimaryEnvironmentId();
  const provider = useAtomValue(primaryServerProvidersAtom).find(
    (candidate) =>
      candidate.driver === "claudeAgent" &&
      isEnabledProviderDriver(candidate.driver) &&
      candidate.enabled,
  );
  const statsAtom =
    environmentId && provider
      ? serverEnvironment.elysiaStats({ environmentId, input: { instanceId: provider.instanceId } })
      : null;
  const [scope, setScope] = useState("current");
  const [range, setRange] = useState("30");
  const [dates, setDates] = useState(() => elysiaUsageRange(30, new Date()));
  const [resolution, setResolution] = useState<ElysiaUsageResolution>("day");
  const [metric, setMetric] = useState<"cost" | "tokens">("cost");
  const now = new Date();
  const today = elysiaUsageRange(1, now).until;
  const timeZone = makeWindow(1, now).timeZone;
  const usageAtom =
    environmentId && provider
      ? serverEnvironment.usageSummary({
          environmentId,
          input: {
            elysiaInstanceId: provider.instanceId,
            sinceDay: UsageDay.make("1970-01-01"),
            untilDay: UsageDay.make(today),
            timeZone,
          },
        })
      : null;
  const query = useEnvironmentQuery(statsAtom);
  const usage = useEnvironmentQuery(usageAtom);
  useEffect(() => {
    // New queries load on subscription; reopen cached queries once without duplicate in-flight reads.
    if (statsAtom) {
      const result = registry.get(statsAtom);
      if (!result.waiting && result._tag !== "Initial") registry.refresh(statsAtom);
    }
    if (usageAtom) {
      const result = registry.get(usageAtom);
      if (!result.waiting && result._tag !== "Initial") registry.refresh(usageAtom);
    }
  }, [registry, statsAtom, usageAtom]);
  const refresh = () => {
    if (statsAtom) registry.refresh(statsAtom);
    if (usageAtom) registry.refresh(usageAtom);
  };
  const snapshot = query.error ? null : query.data;
  const summary = usage.error ? null : usage.data;
  const window = range === "custom" ? dates : elysiaUsageRange(Number(range), now);
  const buckets =
    summary?.buckets.filter(
      (bucket) =>
        scope === "lifetime" || (bucket.day >= window.since && bucket.day <= window.until),
    ) ?? [];
  const periods = elysiaUsagePeriods(buckets, resolution);
  const pricedRecords = buckets.reduce(
    (sum, bucket) => sum + bucket.records - bucket.unpricedRecords,
    0,
  );
  const unpricedRecords = buckets.reduce((sum, bucket) => sum + bucket.unpricedRecords, 0);
  const coverage = Boolean(
    summary?.sources.some((source) => source.status === "ok" || source.status === "partial"),
  );
  const cost = buckets.reduce((sum, bucket) => sum + bucket.costUsd, 0);
  const month = today.slice(0, 7);
  const monthly = summary?.buckets.filter((bucket) => bucket.day.startsWith(month)) ?? [];
  const monthlyCost = monthly.reduce((sum, bucket) => sum + bucket.costUsd, 0);
  const monthlyPriced = monthly.some((bucket) => bucket.records > bucket.unpricedRecords);
  const monthlyAvailable = coverage && (monthlyPriced || monthly.length === 0);
  const monthlyUnknown = monthly.some((bucket) => bucket.unpricedRecords > 0);
  const models = new Map<string, { cost: number; records: number; unpriced: number }>();
  for (const bucket of buckets) {
    const value = models.get(bucket.model) ?? { cost: 0, records: 0, unpriced: 0 };
    value.cost += bucket.costUsd;
    value.records += bucket.records;
    value.unpriced += bucket.unpricedRecords;
    models.set(bucket.model, value);
  }
  const totals =
    snapshot?.status === "available"
      ? scope === "lifetime"
        ? snapshot.lifetime
        : snapshot.session
      : null;
  return (
    <SidebarInset variant="standalone" className="min-h-0 overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <WorkspacePageContainer width="surface">
          <div className="flex min-h-8 items-center justify-between gap-3">
            <h1 className="text-xl font-medium">Stats</h1>
            <div className="flex items-center gap-3">
              <ToggleGroup
                value={[scope]}
                onValueChange={(value) => {
                  if (value[0]) setScope(value[0]);
                }}
                aria-label="Statistics scope"
              >
                <ToggleGroupItem value="current">Current</ToggleGroupItem>
                <ToggleGroupItem value="lifetime">Lifetime</ToggleGroupItem>
              </ToggleGroup>
              <Button
                variant="secondary"
                size="sm"
                disabled={!provider || !environmentId || query.isPending || usage.isPending}
                onClick={refresh}
              >
                {query.isPending || usage.isPending ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Reads this app’s local Elysia CLI profile when Stats opens. Refresh reads the latest
            figures. Reading statistics uses no model tokens.
          </p>
          {query.isPending || usage.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Reading local statistics…
            </p>
          ) : null}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex min-w-0 flex-col gap-6">
              <section className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-medium">Usage</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    {scope === "current" ? (
                      <Select
                        value={range}
                        onValueChange={(value) => {
                          if (value) setRange(value);
                        }}
                      >
                        <SelectTrigger size="sm" aria-label="Usage range">
                          {range === "custom" ? "Custom dates" : `Last ${range} days`}
                        </SelectTrigger>
                        <SelectPopup>
                          <SelectGroup>
                            {["7", "30", "90", "custom"].map((value) => (
                              <SelectItem key={value} value={value}>
                                {value === "custom" ? "Custom dates" : `Last ${value} days`}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectPopup>
                      </Select>
                    ) : null}
                    <Select
                      value={resolution}
                      onValueChange={(value) => {
                        if (
                          value === "day" ||
                          value === "week" ||
                          value === "month" ||
                          value === "year"
                        )
                          setResolution(value);
                      }}
                    >
                      <SelectTrigger size="sm" aria-label="Chart interval">
                        {
                          { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" }[
                            resolution
                          ]
                        }
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectGroup>
                          {(["day", "week", "month", "year"] as const).map((value) => (
                            <SelectItem key={value} value={value}>
                              {
                                { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" }[
                                  value
                                ]
                              }
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectPopup>
                    </Select>
                    <ToggleGroup
                      value={[metric]}
                      onValueChange={(value) => {
                        if (value[0] === "cost" || value[0] === "tokens") setMetric(value[0]);
                      }}
                      aria-label="Chart metric"
                    >
                      <ToggleGroupItem value="cost">Cost</ToggleGroupItem>
                      <ToggleGroupItem value="tokens">Tokens</ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                </div>
                {scope === "current" && range === "custom" ? (
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      From
                      <Input
                        type="date"
                        value={dates.since}
                        max={dates.until}
                        onChange={(event) => setDates({ ...dates, since: event.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      To
                      <Input
                        type="date"
                        value={dates.until}
                        min={dates.since}
                        max={today}
                        onChange={(event) => setDates({ ...dates, until: event.target.value })}
                      />
                    </label>
                  </div>
                ) : null}
                <dl>
                  <dt className="text-sm text-muted-foreground">
                    {unpricedRecords ? "Known usage cost" : "Total usage cost"} · USD estimate
                  </dt>
                  <dd className="text-2xl font-medium tabular-nums">
                    {coverage && (pricedRecords > 0 || buckets.length === 0)
                      ? savingsFormat.format(cost)
                      : "Unavailable"}
                  </dd>
                </dl>
                {periods.length ? (
                  <UsageProviderChart
                    providerLabel="Elysia"
                    providers={["claude"]}
                    days={periods.map((period) => period.day)}
                    daily={periods}
                    hours={[]}
                    hourly={[]}
                    metric={metric}
                    referenceTime={summary?.readAt}
                    resolution="day"
                    timeZone={timeZone}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No dated Elysia usage records in this range.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Costs use native reported values or model pricing, including input and output
                  tokens. They are usage estimates, not a gateway bill. History covers retained CLI
                  records.
                </p>
                {unpricedRecords > 0 ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    {numberFormat.format(unpricedRecords)} responses have no known price and are
                    excluded from cost.
                  </p>
                ) : null}
                {usage.error ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    Usage records could not be read. Use Refresh to try again.
                  </p>
                ) : null}
              </section>
              <section className="flex flex-col gap-3">
                <h2 className="text-base font-medium">Cost by model</h2>
                <dl className="flex flex-col gap-2">
                  {[...models]
                    .sort(([, a], [, b]) => b.cost - a.cost)
                    .map(([model, value]) => (
                      <div key={model} className="flex items-center justify-between gap-4">
                        <dt className="truncate text-sm">{model}</dt>
                        <dd className="text-sm tabular-nums">
                          {value.records === value.unpriced
                            ? "Unpriced"
                            : savingsFormat.format(value.cost)}
                          {value.unpriced && value.records !== value.unpriced ? " · partial" : ""}
                        </dd>
                      </div>
                    ))}
                </dl>
              </section>
            </div>
            <aside className="flex flex-col gap-6">
              <section className="flex flex-col gap-3">
                <h2 className="text-base font-medium">Monthly target</h2>
                <p className="text-sm tabular-nums">
                  {monthlyAvailable ? savingsFormat.format(monthlyCost) : "Unavailable"} / $200
                  {monthlyUnknown ? " · partial" : ""}
                </p>
                {monthlyAvailable ? (
                  <div
                    role="meter"
                    aria-label="Monthly estimated usage cost"
                    aria-valuemin={0}
                    aria-valuemax={200}
                    aria-valuenow={Math.min(200, monthlyCost)}
                    aria-valuetext={`${savingsFormat.format(monthlyCost)} of $200`}
                    className="h-2 overflow-hidden rounded-full bg-input"
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(100, monthlyCost / 2)}%` }}
                    />
                  </div>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  Calendar month · {month}. A tracking target; it does not enforce a spending limit.
                </p>
              </section>
              {totals ? (
                <SavingsSummary
                  title={
                    scope === "lifetime" ? "Lifetime compression" : "Current compression session"
                  }
                  totals={totals}
                />
              ) : (
                <p role="status" className="text-sm text-muted-foreground">
                  {snapshot?.status === "unavailable"
                    ? unavailableMessages[snapshot.reason]
                    : "Compression statistics are unavailable."}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Compression sessions are CLI activity windows, shared across chats. Savings are
                independent of the usage range.
              </p>
              {!provider ? (
                <Button render={<Link to="/settings/providers" />}>Open Providers</Button>
              ) : null}
            </aside>
          </div>
        </WorkspacePageContainer>
      </div>
    </SidebarInset>
  );
}

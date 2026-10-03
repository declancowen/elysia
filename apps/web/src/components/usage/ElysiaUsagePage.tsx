import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import { useContext, useState } from "react";
import { isEnabledProviderDriver } from "@t3tools/contracts";
import type { ElysiaStatsTotals } from "@t3tools/contracts";

import { useEscapeToGoBack } from "../../hooks/useNavigateBack";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { primaryServerProvidersAtom, serverEnvironment } from "../../state/server";
import { Button } from "../ui/button";
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
    "Compression stats are unavailable. Elysia starts the local proxy automatically. Try Refresh, or check setup in Providers.",
  "invalid-data":
    "Your Elysia CLI could not report supported compression stats. Check for a CLI update in Providers, then refresh.",
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
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
  const targetKey = JSON.stringify([environmentId, provider?.instanceId]);
  const [requestedTarget, setRequestedTarget] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<{ key: string; time: number } | null>(null);
  const query = useEnvironmentQuery(requestedTarget === targetKey ? statsAtom : null);
  const snapshot = query.error ? null : query.data;
  if (
    !query.isPending &&
    snapshot?.status === "available" &&
    query.dataUpdatedAt !== null &&
    (lastUpdated?.key !== targetKey || lastUpdated.time !== query.dataUpdatedAt)
  ) {
    setLastUpdated({ key: targetKey, time: query.dataUpdatedAt });
  }
  const refresh = () => {
    if (statsAtom) {
      registry.refresh(statsAtom);
      setRequestedTarget(targetKey);
    }
  };
  const unavailableMessage =
    snapshot?.status === "unavailable"
      ? unavailableMessages[snapshot.reason]
      : query.error
        ? "Elysia stats could not be loaded. Check your connection, then refresh."
        : "Connect Elysia in Providers to view your compression savings.";
  return (
    <SidebarInset variant="standalone" className="min-h-0 overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <WorkspacePageContainer width="surface">
          <div className="flex min-h-8 items-center justify-between gap-3">
            <h1 className="text-xl font-medium">Stats</h1>
            <Button
              variant="secondary"
              size="sm"
              disabled={!environmentId || !provider || query.isPending}
              onClick={refresh}
            >
              {query.isPending ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Savings reported by your local Elysia CLI. Cost savings are estimates in US dollars.
            Reads local usage data without sending a model request.
          </p>
          <p className="text-sm text-muted-foreground">
            Last updated:{" "}
            {lastUpdated?.key === targetKey ? (
              <time dateTime={new Date(lastUpdated.time).toISOString()}>
                {new Date(lastUpdated.time).toLocaleString()}
              </time>
            ) : (
              "Not refreshed yet"
            )}
          </p>
          {snapshot?.status === "available" ? (
            <div className="space-y-6">
              <SavingsSummary
                title="Current session"
                totals={snapshot.session}
                savingsPercent={snapshot.session.savingsPercent}
              />
              {snapshot.lifetime ? (
                <SavingsSummary title="Lifetime" totals={snapshot.lifetime} />
              ) : null}
            </div>
          ) : query.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Reading Elysia stats…
            </p>
          ) : requestedTarget !== targetKey && statsAtom ? (
            <p role="status" className="text-sm text-muted-foreground">
              Click Refresh to view your compression stats.
            </p>
          ) : (
            <section className="space-y-3">
              <p role="status" className="text-sm text-muted-foreground">
                {unavailableMessage}
              </p>
              <Button render={<Link to="/settings/providers" />}>Open Providers</Button>
            </section>
          )}
        </WorkspacePageContainer>
      </div>
    </SidebarInset>
  );
}

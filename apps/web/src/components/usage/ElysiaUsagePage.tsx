import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import { isEnabledProviderDriver } from "@t3tools/contracts";
import type { ElysiaStatsTotals } from "@t3tools/contracts";

import { isElectron } from "../../env";
import { useEscapeToGoBack } from "../../hooks/useNavigateBack";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { primaryServerProvidersAtom, serverEnvironment } from "../../state/server";
import { ElysiaIcon } from "../Icons";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";

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
    "Compression stats are unavailable. Start a chat to activate the Elysia proxy, then refresh.",
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
            className="min-w-0 rounded-xl border border-border bg-background px-5 py-4"
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
  const environmentId = usePrimaryEnvironmentId();
  const provider = useAtomValue(primaryServerProvidersAtom).find(
    (candidate) =>
      candidate.driver === "claudeAgent" &&
      isEnabledProviderDriver(candidate.driver) &&
      candidate.enabled,
  );
  const query = useEnvironmentQuery(
    environmentId && provider
      ? serverEnvironment.elysiaStats({ environmentId, input: { instanceId: provider.instanceId } })
      : null,
  );
  const snapshot = query.error ? null : query.data;
  const unavailableMessage =
    snapshot?.status === "unavailable"
      ? unavailableMessages[snapshot.reason]
      : query.error
        ? "Elysia stats could not be loaded. Check your connection, then refresh."
        : "Connect Elysia in Providers to view your compression savings.";
  return (
    <SidebarInset>
      <WorkspacePageHeader electron={isElectron}>
        <span className="text-sm font-medium">Stats</span>
      </WorkspacePageHeader>
      <WorkspacePageContainer width="expanded">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ElysiaIcon className="size-8" />
            <h1 className="text-xl font-medium">Elysia stats</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!environmentId || !provider || query.isPending}
            onClick={query.refresh}
          >
            {query.isPending ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Savings reported by your local Elysia CLI. Cost savings are estimates in US dollars.
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
        ) : (
          <section className="space-y-3">
            <p role="status" className="text-sm text-muted-foreground">
              {unavailableMessage}
            </p>
            <Button render={<Link to="/settings/providers" />}>Open Providers</Button>
          </section>
        )}
        <p className="text-sm text-muted-foreground">
          You can also type <code>/elysia-compression stats</code> in a chat.
        </p>
      </WorkspacePageContainer>
    </SidebarInset>
  );
}

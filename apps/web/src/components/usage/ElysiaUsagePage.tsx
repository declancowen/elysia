import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import { isEnabledProviderDriver } from "@t3tools/contracts";

import { isElectron } from "../../env";
import { useEscapeToGoBack } from "../../hooks/useNavigateBack";
import { primaryServerProvidersAtom } from "../../state/server";
import { ElysiaIcon } from "../Icons";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";

export function ElysiaUsagePage() {
  useEscapeToGoBack();
  const providers = useAtomValue(primaryServerProvidersAtom).filter(
    (provider) => isEnabledProviderDriver(provider.driver) && provider.enabled,
  );
  return (
    <SidebarInset>
      <WorkspacePageHeader electron={isElectron}>
        <span className="text-sm font-medium">Stats</span>
      </WorkspacePageHeader>
      <WorkspacePageContainer width="expanded">
        <div className="flex items-center gap-3">
          <ElysiaIcon className="size-8" />
          <h1 className="text-xl font-medium">Elysia stats</h1>
        </div>
        {providers.map((provider) => {
          const compression = provider.elysiaCompression;
          const url = `http://127.0.0.1:${compression?.port ?? 8787}/dashboard`;
          return compression?.enabled ? (
            <section key={provider.instanceId} className="flex min-h-[70vh] flex-1 flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Native compression stats appear here while the Elysia CLI proxy is running.
              </p>
              <iframe
                title="Elysia compression dashboard"
                src={url}
                sandbox="allow-scripts allow-same-origin"
                referrerPolicy="no-referrer"
                className="min-h-[70vh] w-full flex-1 rounded-xl border border-border bg-background"
              />
            </section>
          ) : (
            <section key={provider.instanceId} className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Connect Elysia in Providers to enable native compression stats.
              </p>
              <Button render={<Link to="/settings/providers" />}>Connect Elysia</Button>
            </section>
          );
        })}
        {providers.length === 0 ? (
          <Button render={<Link to="/settings/providers" />}>Set up Elysia</Button>
        ) : null}
      </WorkspacePageContainer>
    </SidebarInset>
  );
}

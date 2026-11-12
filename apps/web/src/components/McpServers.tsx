import {
  AuthProvidersManageScope,
  type ElysiaMcpRegistration,
  type EnvironmentId,
} from "@elysiatools/contracts";

import { SettingsPageContainer, SettingsSection } from "./settings/settingsLayout";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { SidebarInset } from "./ui/sidebar";
import { WorkspacePageContainer } from "./WorkspacePageContainer";
import { WorkspaceSurfaceHeader } from "./WorkspaceSurfaceHeader";
import { Plug2Icon, RefreshCwIcon } from "~/icons";
import { useEnvironmentQuery, type EnvironmentQueryView } from "../state/query";
import { serverEnvironment } from "../state/server";
import { useEnvironmentScope } from "../state/session";

export function McpServers({
  environmentId,
  surface,
}: {
  environmentId: EnvironmentId | null;
  surface: "workspace" | "settings";
}) {
  const canRead = useEnvironmentScope(environmentId, AuthProvidersManageScope);
  const registrations = useEnvironmentQuery(
    canRead && environmentId !== null
      ? serverEnvironment.elysiaMcpRegistrations({ environmentId, input: {} })
      : null,
  );

  const refresh = canRead ? (
    <Button variant="outline" onClick={registrations.refresh} disabled={registrations.isPending}>
      <RefreshCwIcon /> Refresh
    </Button>
  ) : null;
  const unavailableMessage =
    environmentId === null
      ? "Connect an environment to see its MCP servers."
      : canRead
        ? null
        : "Provider access is required to view MCP servers.";
  const content = (
    <McpInventory registrations={registrations} unavailableMessage={unavailableMessage} />
  );
  if (surface === "settings") {
    return (
      <SettingsPageContainer>
        <SettingsSection
          id="mcp-servers"
          title="Claude profile MCP servers"
          variant="plain"
          headerAction={refresh}
        >
          <div className="px-3 sm:px-4">{content}</div>
        </SettingsSection>
      </SettingsPageContainer>
    );
  }
  return (
    <SidebarInset variant="standalone" className="min-h-0 overflow-hidden">
      <WorkspaceSurfaceHeader title="MCP" actions={refresh} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <WorkspacePageContainer width="surface">{content}</WorkspacePageContainer>
      </div>
    </SidebarInset>
  );
}

function McpInventory({
  registrations: { data, error, isPending },
  unavailableMessage,
}: {
  registrations: EnvironmentQueryView<readonly ElysiaMcpRegistration[]>;
  unavailableMessage: string | null;
}) {
  const servers = data ?? [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Shows registrations from Claude Code and Elysia profiles. Claude loads repository
        registrations from each project’s <code>.mcp.json</code>.
      </p>
      {servers.length > 0 ? (
        <>
          {error ? (
            <p className="text-sm text-muted-foreground" role="status">
              Could not refresh. Showing the last loaded registrations.
            </p>
          ) : null}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
            {servers.map((server) => (
              <li
                key={server.id}
                className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-4 text-card-foreground"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Plug2Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <h3 className="min-w-0 flex-1 wrap-anywhere font-medium">{server.name}</h3>
                  <Badge variant="outline">{server.disabled ? "Disabled" : "Configured"}</Badge>
                </div>
                <p className="wrap-anywhere text-sm text-muted-foreground">
                  {server.project === null ? "All projects" : `Project · ${server.project}`}
                  {server.transport
                    ? ` · ${server.transport === "stdio" ? "Stdio" : server.transport.toUpperCase()}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="py-4 text-sm text-muted-foreground" role="status">
          {unavailableMessage ??
            error ??
            (isPending
              ? "Loading MCP servers…"
              : "No MCP servers configured in Claude Code or Elysia.")}
        </p>
      )}
    </div>
  );
}

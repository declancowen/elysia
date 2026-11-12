import { createFileRoute } from "@tanstack/react-router";
import { AuthProvidersManageScope } from "@elysiatools/contracts";

import { SettingsSection } from "../components/settings/settingsLayout";
import { useSettingsScope } from "../components/settings/SettingsScopeContext";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Plug2Icon, RefreshCwIcon } from "~/icons";
import { useEnvironmentQuery } from "../state/query";
import { serverEnvironment } from "../state/server";
import { useEnvironmentScope } from "../state/session";

function McpSettingsRoute() {
  const { environment } = useSettingsScope();
  const environmentId = environment?.environmentId ?? null;
  const canRead = useEnvironmentScope(environmentId, AuthProvidersManageScope);
  const registrations = useEnvironmentQuery(
    canRead && environmentId !== null
      ? serverEnvironment.elysiaMcpRegistrations({ environmentId, input: {} })
      : null,
  );

  return (
    <SettingsSection
      title="Claude profile MCP servers"
      variant="plain"
      headerAction={
        canRead && environmentId !== null ? (
          <Button
            size="sm"
            variant="outline"
            onClick={registrations.refresh}
            disabled={registrations.isPending}
          >
            <RefreshCwIcon /> Refresh
          </Button>
        ) : undefined
      }
    >
      <p className="px-3 text-sm text-muted-foreground sm:px-4">
        Shows registrations from Claude Code and Elysia profiles. Claude loads repository
        registrations from each project’s <code>.mcp.json</code>.
      </p>
      {canRead && registrations.data?.length && registrations.error ? (
        <p className="px-3 text-sm text-muted-foreground sm:px-4" role="status">
          Could not refresh. Showing the last loaded registrations.
        </p>
      ) : null}
      {environmentId === null || !canRead || !registrations.data?.length ? (
        <p className="px-3 py-4 text-sm text-muted-foreground" role="status">
          {environmentId === null
            ? "Connect an environment to see its MCP servers."
            : !canRead
              ? "Provider access is required to view MCP servers."
              : (registrations.error ??
                (registrations.isPending
                  ? "Loading MCP servers…"
                  : "No MCP servers configured in Claude Code or Elysia."))}
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3 px-3 sm:px-4">
          {registrations.data.map((server) => (
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
      )}
    </SettingsSection>
  );
}

export const Route = createFileRoute("/_chat/settings/mcp")({ component: McpSettingsRoute });

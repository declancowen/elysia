import { createFileRoute } from "@tanstack/react-router";
import { McpServers } from "../components/McpServers";
import { useSettingsScope } from "../components/settings/SettingsScopeContext";

function McpSettingsRoute() {
  const { environment } = useSettingsScope();
  return <McpServers environmentId={environment?.environmentId ?? null} surface="settings" />;
}

export const Route = createFileRoute("/_chat/settings/mcp")({ component: McpSettingsRoute });

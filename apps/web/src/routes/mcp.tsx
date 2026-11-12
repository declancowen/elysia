import { createFileRoute, redirect } from "@tanstack/react-router";

import { McpServers } from "../components/McpServers";
import { usePrimaryEnvironmentId } from "../state/environments";

function McpWorkspaceRoute() {
  return <McpServers environmentId={usePrimaryEnvironmentId()} surface="workspace" />;
}

export const Route = createFileRoute("/mcp")({
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: McpWorkspaceRoute,
});

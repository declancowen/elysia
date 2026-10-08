import { createFileRoute, redirect } from "@tanstack/react-router";

import { CONNECTIONS_ENABLED } from "@elysiatools/contracts";

import { ConnectAgentSurface } from "../components/auth/ConnectAgentSurface";

export const Route = createFileRoute("/connect-agent")({
  beforeLoad: () => {
    if (!CONNECTIONS_ENABLED) throw redirect({ to: "/", replace: true });
  },
  component: ConnectAgentSurface,
});

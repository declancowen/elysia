import * as RelayTracing from "@elysiatools/shared/relayTracing";

import { resolveRelayClientTracingConfig } from "./publicConfig.ts";

const relayClientTracingConfig = resolveRelayClientTracingConfig();

export const layerHeadlessRelayClient = RelayTracing.layer(relayClientTracingConfig, {
  serviceName: "elysia-server",
  runtime: "node",
  client: "headless-cli",
});

export const layerServerRelayBroker = RelayTracing.layer(relayClientTracingConfig, {
  serviceName: "elysia-server",
  runtime: "node",
  client: "environment-server",
  component: "relay-broker",
});

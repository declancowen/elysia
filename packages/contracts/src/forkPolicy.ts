/** Company fork policy. Keep upstream implementations available for merging. */
export const SINGLE_PROVIDER_UI = true;
export const APP_NAME = "Elysia";
export const CONNECTIONS_ENABLED = false;
export const EXTERNAL_USAGE_SOURCES_ENABLED = false;
export const UPSTREAM_ANALYTICS_ENABLED = false;
export const isEnabledProviderDriver = (driver: string): boolean => driver === "claudeAgent";

export const isConnectionsRpcMethod = (method: string): boolean =>
  method.startsWith("cloud.") ||
  method === "subscribeDiscoveredLocalServers" ||
  method === "subscribeAuthAccess";

export const isConnectionsHttpPath = (path: string): boolean =>
  path.startsWith("/api/connect/") ||
  path.startsWith("/api/t3-connect/") ||
  path.startsWith("/api/auth/pairing-") ||
  path === "/api/auth/clients" ||
  path.startsWith("/api/auth/clients/");

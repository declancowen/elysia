/** Company fork policy. Keep upstream implementations available for merging. */
export const SINGLE_PROVIDER_UI = true;
export const APP_NAME = "Elysia";
export const APP_DATA_DIRECTORY = ".elysia";
export const CONNECTIONS_ENABLED = false;
export const EXTERNAL_USAGE_SOURCES_ENABLED = false;
export const UPSTREAM_ANALYTICS_ENABLED = false;
export const isEnabledProviderDriver = (driver: string): boolean => driver === "claudeAgent";

export const isConnectionsRpcMethod = (method: string): boolean =>
  method.startsWith("cloud.") ||
  method === "subscribeDiscoveredLocalServers" ||
  method === "subscribeAuthAccess";

export const isConnectionsHttpPath = (path: string): boolean =>
  path === "/.well-known/oauth-protected-resource" ||
  path === "/.well-known/oauth-protected-resource/mcp" ||
  path === "/.well-known/oauth-authorization-server" ||
  path.startsWith("/oauth/mcp/") ||
  path.startsWith("/api/connect/") ||
  path.startsWith("/api/t3-connect/") ||
  path.startsWith("/api/auth/pairing-") ||
  path === "/api/auth/clients" ||
  path.startsWith("/api/auth/clients/");

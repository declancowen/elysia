import { CONNECTIONS_ENABLED } from "@elysiatools/contracts";

/**
 * True when the desktop app runs without its local server. The renderer then
 * has no primary environment: it skips primary auth and discovery and only
 * connects to saved remote environments. Always false in browsers and on
 * desktop builds predating the setting, and forks that require a local server.
 */
export function isLocalEnvironmentDisabled(): boolean {
  return CONNECTIONS_ENABLED && window.desktopBridge?.getLocalEnvironmentEnabled?.() === false;
}

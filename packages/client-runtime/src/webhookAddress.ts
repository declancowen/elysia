import type { ScheduledTaskWebhookEndpoint } from "@elysiatools/contracts";
import { isLocalLoopbackHost } from "@elysiatools/shared/hostClassification";

export interface WebhookAddress {
  readonly address: string;
  readonly copyable: boolean;
  readonly note: string | null;
}

export function webhookAddress(
  endpoint: ScheduledTaskWebhookEndpoint,
  httpBaseUrl: string | null,
): WebhookAddress {
  if (endpoint.url !== null) {
    return { address: endpoint.url, copyable: true, note: null };
  }
  if (httpBaseUrl === null) {
    return {
      address: endpoint.path,
      copyable: false,
      note: "Link this environment to Elysia Connect for a public URL.",
    };
  }
  const url = new URL(endpoint.path, httpBaseUrl);
  return {
    address: url.href,
    copyable: true,
    note: isLocalLoopbackHost(url.hostname)
      ? "Only this computer can call this address. Link Elysia Connect for a public URL."
      : "Works wherever this environment's address is reachable, for example over Tailscale or your own proxy. Link Elysia Connect for a public URL.",
  };
}

import { isProviderDriverKind } from "@elysiatools/contracts";
import { acpRegistryClient } from "@elysiatools/provider-acp-registry/client";
import { makeProviderClientRegistry } from "@elysiatools/provider-core/client";
import { cursorClient } from "@elysiatools/provider-cursor/client";
import { grokClient } from "@elysiatools/provider-grok/client";
import { museClient } from "@elysiatools/provider-muse/client";
import { openCodeClient } from "@elysiatools/provider-opencode/client";
import { piClient } from "@elysiatools/provider-pi/client";

const providerClients = makeProviderClientRegistry([
  cursorClient,
  grokClient,
  museClient,
  openCodeClient,
  piClient,
  acpRegistryClient,
]);

export function getProviderClient(driver: string | null | undefined) {
  return isProviderDriverKind(driver) ? providerClients.get(driver) : undefined;
}

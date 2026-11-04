import {
  AntigravitySettings,
  ClaudeSettings,
  CodexSettings,
  isProviderDriverKind,
  ProviderDriverKind,
} from "@elysiatools/contracts";
import { acpRegistryClient } from "@elysiatools/provider-acp-registry/client";
import { makeProviderClientRegistry } from "@elysiatools/provider-core/client";
import { modelShortName } from "@elysiatools/provider-core/modelShortName";
import { cursorClient } from "@elysiatools/provider-cursor/client";
import { fxClient } from "@elysiatools/provider-fx/client";
import { grokClient } from "@elysiatools/provider-grok/client";
import { kiroClient } from "@elysiatools/provider-kiro/client";
import { museClient } from "@elysiatools/provider-muse/client";
import { openCodeClient } from "@elysiatools/provider-opencode/client";
import { piClient } from "@elysiatools/provider-pi/client";

export const providerClients = makeProviderClientRegistry([
  {
    driverKind: ProviderDriverKind.make("codex"),
    label: "Codex",
    modelFamilies: ["GPT-", "GPT "],
    acpRegistryAgentIds: ["codex-acp"],
    settingsSchema: CodexSettings,
  },
  {
    driverKind: ProviderDriverKind.make("claudeAgent"),
    label: "Elysia",
    modelFamilies: ["Claude "],
    acpRegistryAgentIds: ["claude-acp"],
    settingsSchema: ClaudeSettings,
  },
  cursorClient,
  grokClient,
  fxClient,
  openCodeClient,
  {
    driverKind: ProviderDriverKind.make("antigravity"),
    label: "Antigravity",
    modelFamilies: ["Gemini "],
    acpRegistryAgentIds: ["antigravity-acp"],
    settingsSchema: AntigravitySettings,
  },
  kiroClient,
  museClient,
  piClient,
  acpRegistryClient,
]);

export function getProviderClient(driver: string | null | undefined) {
  return isProviderDriverKind(driver) ? providerClients.get(driver) : undefined;
}

export function resolveModelShortName(
  model: { readonly name: string; readonly shortName?: string | undefined },
  driverKind: ProviderDriverKind | null | undefined,
): string | undefined {
  if (model.shortName) return model.shortName;
  const families = driverKind ? providerClients.get(driverKind)?.modelFamilies : undefined;
  return modelShortName(model.name, families ?? []);
}

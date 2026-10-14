import {
  AntigravitySettings,
  ClaudeSettings,
  CodexSettings,
  ProviderDriverKind,
} from "@elysiatools/contracts";
import { acpRegistryClient } from "@elysiatools/provider-acp-registry/client";
import { makeProviderClientRegistry } from "@elysiatools/provider-core/client";
import { cursorClient } from "@elysiatools/provider-cursor/client";
import { grokClient } from "@elysiatools/provider-grok/client";
import { museClient } from "@elysiatools/provider-muse/client";
import { openCodeClient } from "@elysiatools/provider-opencode/client";
import { piClient } from "@elysiatools/provider-pi/client";

/** The provider client definitions this web build ships, in presentation order. */
export const providerClients = makeProviderClientRegistry([
  {
    driverKind: ProviderDriverKind.make("codex"),
    label: "Codex",
    settingsSchema: CodexSettings,
  },
  {
    driverKind: ProviderDriverKind.make("claudeAgent"),
    label: "Elysia",
    settingsSchema: ClaudeSettings,
  },
  cursorClient,
  grokClient,
  openCodeClient,
  {
    driverKind: ProviderDriverKind.make("antigravity"),
    label: "Antigravity",
    settingsSchema: AntigravitySettings,
  },
  museClient,
  piClient,
  acpRegistryClient,
]);

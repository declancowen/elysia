import { ElysiaDriver, type ElysiaDriverEnv } from "./Drivers/ElysiaDriver.ts";
import { ClaudeDriver } from "./Drivers/ClaudeDriver.ts";
import type {
  AnyProviderDriver,
  ProviderUsageReaderEnv,
} from "@elysiatools/provider-core/server/driver";

export type BuiltInDriversEnv = ElysiaDriverEnv;

// Elysia uses Claude Code's native protocol. Other upstream drivers stay dormant.
export const BUILT_IN_DRIVERS: ReadonlyArray<AnyProviderDriver<BuiltInDriversEnv>> = [ElysiaDriver];

// Elysia sessions use the native Claude transcript format; no other usage source runs.
export type BuiltInUsageReadersEnv = ProviderUsageReaderEnv<typeof ClaudeDriver>;
export const BUILT_IN_USAGE_DRIVERS = [ClaudeDriver] as const;

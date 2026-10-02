import { ElysiaDriver, type ElysiaDriverEnv } from "./Drivers/ElysiaDriver.ts";
import type { AnyProviderDriver } from "./ProviderDriver.ts";

export type BuiltInDriversEnv = ElysiaDriverEnv;

// Elysia uses Claude Code's native protocol. Other upstream drivers stay dormant.
export const BUILT_IN_DRIVERS: ReadonlyArray<AnyProviderDriver<BuiltInDriversEnv>> = [ElysiaDriver];

import { ElysiaDriver, type ElysiaDriverEnv } from "./Drivers/ElysiaDriver.ts";
/**
 * BUILT_IN_DRIVERS — the static set of `ProviderDriver`s this build ships
 * with.
 *
 * Every driver that the server knows how to instantiate from settings is
 * listed here. The `ProviderInstanceRegistry` iterates this array when
 * resolving `providerInstances` entries; anything not in the array surfaces
 * as an `"unavailable"` shadow snapshot at runtime (see
 * `buildUnavailableProviderSnapshot`).
 *
 * Adding a new first-party driver means:
 *   1. implement `ProviderDriver` in a sibling `Drivers/<Name>Driver.ts`,
 *   2. add it to this array,
 *   3. ensure the runtime layer satisfies its declared `R`.
 *
 * The aggregated `BuiltInDriversEnv` type is the union of every driver's
 * env requirement — the registry layer's `R` is this type, and the runtime
 * layer (ChildProcessSpawner, FileSystem, Path, ServerConfig,
 * OpenCodeRuntime, …) must satisfy it.
 *
 * @module provider/builtInDrivers
 */
import type { ClaudeDriverEnv } from "./Drivers/ClaudeDriver.ts";
import type { AnyProviderDriver } from "./ProviderDriver.ts";

import type { CodexDriverEnv } from "./Drivers/CodexDriver.ts";
import type { CursorDriverEnv } from "./Drivers/CursorDriver.ts";
import type { GrokDriverEnv } from "./Drivers/GrokDriver.ts";
import type { OpenCodeDriverEnv } from "./Drivers/OpenCodeDriver.ts";
import type { AntigravityDriverEnv } from "./Drivers/AntigravityDriver.ts";

export type BuiltInDriversEnv =
  | ElysiaDriverEnv
  | ClaudeDriverEnv
  | CodexDriverEnv
  | CursorDriverEnv
  | GrokDriverEnv
  | OpenCodeDriverEnv
  | AntigravityDriverEnv;

// Elysia uses Claude Code's native protocol. Other upstream drivers stay dormant.
export const BUILT_IN_DRIVERS: ReadonlyArray<AnyProviderDriver<BuiltInDriversEnv>> = [ElysiaDriver];

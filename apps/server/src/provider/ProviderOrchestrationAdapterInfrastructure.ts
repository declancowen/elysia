import * as Layer from "effect/Layer";

import * as ClaudeAdapterV2 from "../orchestration-v2/Adapters/ClaudeAdapterV2.ts";
import * as IdAllocator from "@elysiatools/provider-core/server/IdAllocator";
import * as ProviderContinuationRequests from "@elysiatools/provider-core/server/ProviderContinuationRequests";

export type ProviderOrchestrationAdapterInfrastructure =
  | ClaudeAdapterV2.ClaudeAgentSdkQueryRunner
  | IdAllocator.IdAllocatorV2;

/**
 * `providerContinuationRequestsLayer` must be the same layer reference the
 * orchestration runtime provides to its continuation worker so Effect layer
 * memoization yields one shared queue.
 */
export const layer = Layer.mergeAll(
  ClaudeAdapterV2.layerQueryRunner,
  IdAllocator.layer,
  ProviderContinuationRequests.layer,
);

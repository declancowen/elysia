import * as Layer from "effect/Layer";

import * as ClaudeAdapterV2 from "../orchestration-v2/Adapters/ClaudeAdapterV2.ts";
import * as IdAllocator from "@elysiatools/provider-core/server/IdAllocator";
import * as ProviderContinuationRequests from "@elysiatools/provider-core/server/ProviderContinuationRequests";

export type ProviderOrchestrationAdapterInfrastructure =
  | ClaudeAdapterV2.ClaudeAgentSdkQueryRunner
  | IdAllocator.IdAllocatorV2;

/** Reuse the continuation worker's exact layer reference so memoization shares one queue. */
export const layer = Layer.mergeAll(
  ClaudeAdapterV2.layerQueryRunner,
  IdAllocator.layer,
  ProviderContinuationRequests.layer,
);

import * as Effect from "effect/Effect";
import * as RepositoryInitialization from "../../../project/RepositoryInitialization.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { RepositoryToolkit } from "./tools.ts";

export const layer = McpToolAccess.toLayer(RepositoryToolkit, {
  initialize_git: McpToolAccess.actsAsCaller(() =>
    Effect.gen(function* () {
      const invocation = yield* McpInvocationContext.requireMcpCapability("repository");
      const scope = yield* McpInvocationContext.requireThreadScope(invocation, "initialize_git");
      const repositories = yield* RepositoryInitialization.RepositoryInitialization;
      return yield* repositories.initialize(scope.thread);
    }),
  ),
});

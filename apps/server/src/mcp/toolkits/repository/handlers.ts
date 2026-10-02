import * as Effect from "effect/Effect";
import * as RepositoryInitialization from "../../../project/RepositoryInitialization.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { RepositoryToolkit } from "./tools.ts";

const make = Effect.gen(function* () {
  const repositories = yield* RepositoryInitialization.RepositoryInitialization;
  return RepositoryToolkit.of({
    initialize_git: Effect.fn("RepositoryToolkit.initializeGit")(function* () {
      const scope = yield* McpInvocationContext.requireMcpCapability("repository");
      return yield* repositories.initialize(scope);
    }),
  });
});
export const RepositoryToolkitHandlersLive = RepositoryToolkit.toLayer(make);

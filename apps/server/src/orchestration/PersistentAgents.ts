import {
  type AgentCreateInput,
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  OrchestrationDispatchCommandError,
  type ClientOrchestrationCommand,
  ProjectId,
  ThreadId,
  isEnabledProviderDriver,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { ServerConfig } from "../config.ts";
import { ProviderRegistry } from "../provider/Services/ProviderRegistry.ts";

export type PersistentAgentCommand = Extract<
  ClientOrchestrationCommand,
  {
    readonly type: "project.create" | "project.meta.update" | "project.delete" | "thread.create";
  }
>;

export const createPersistentAgent = Effect.fn("createPersistentAgent")(function* (
  input: AgentCreateInput,
  dispatch: (
    command: PersistentAgentCommand,
  ) => Effect.Effect<unknown, OrchestrationDispatchCommandError, Crypto.Crypto>,
) {
  const config = yield* ServerConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const providers = yield* (yield* ProviderRegistry).getProviders;
  const provider = providers.find(
    (entry) => entry.instanceId === input.defaultModelSelection.instanceId,
  );
  if (
    !provider?.enabled ||
    !isEnabledProviderDriver(provider.driver) ||
    !provider.models.some((entry) => entry.slug === input.defaultModelSelection.model)
  ) {
    return yield* new OrchestrationDispatchCommandError({
      message: "Choose an available Elysia model for this agent.",
    });
  }
  const uuid = yield* crypto.randomUUIDv4.pipe(
    Effect.mapError(
      (cause) =>
        new OrchestrationDispatchCommandError({
          message: "Could not create the agent identity.",
          cause,
        }),
    ),
  );
  const projectId = ProjectId.make(uuid);
  const threadId = ThreadId.make(`agent-${uuid}`);
  const workspaceRoot = path.join(config.stateDir, "agents", uuid);
  const now = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));
  yield* fs.makeDirectory(path.join(workspaceRoot, ".claude", "memory"), { recursive: true }).pipe(
    Effect.mapError(
      (cause) =>
        new OrchestrationDispatchCommandError({
          message: "Could not create the agent workspace.",
          cause,
        }),
    ),
  );
  yield* dispatch({
    type: "project.create",
    commandId: CommandId.make(`agent-create-${uuid}`),
    projectId,
    title: input.name,
    workspaceRoot,
    agentProfile: { ...input.agentProfile, archived: false, conversationThreadId: threadId },
    createdAt: now,
  });
  return yield* Effect.gen(function* () {
    // This explicit choice follows ordinary project model-default semantics.
    yield* dispatch({
      type: "project.meta.update",
      commandId: CommandId.make(`agent-model-${uuid}`),
      projectId,
      defaultModelSelection: input.defaultModelSelection,
    });
    yield* dispatch({
      type: "thread.create",
      commandId: CommandId.make(`agent-thread-${uuid}`),
      threadId,
      projectId,
      title: input.name,
      modelSelection: input.defaultModelSelection,
      runtimeMode: DEFAULT_RUNTIME_MODE,
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      branch: null,
      worktreePath: null,
      createdAt: now,
    });
    return { projectId, threadId };
  }).pipe(
    Effect.onError(() =>
      dispatch({
        type: "project.delete",
        commandId: CommandId.make(`agent-create-cleanup-${uuid}`),
        projectId,
        force: true,
      }).pipe(Effect.ignoreCause({ log: true })),
    ),
  );
});

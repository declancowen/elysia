import {
  type AgentCreateInput,
  type AgentCreateResult,
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  OrchestrationDispatchCommandError,
  ProjectId,
  ThreadId,
  isEnabledProviderDriver,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { ServerConfig } from "../config.ts";
import { ProviderRegistry } from "../provider/Services/ProviderRegistry.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as ThreadManagement from "./ThreadManagementService.ts";

const createPersistentAgentImpl = Effect.fn("createPersistentAgent")(function* (
  input: AgentCreateInput,
) {
  const projects = yield* ProjectService.ProjectService;
  const threads = yield* ThreadManagement.ThreadManagementService;
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
  yield* fs.makeDirectory(path.join(workspaceRoot, ".claude", "memory"), { recursive: true }).pipe(
    Effect.mapError(
      (cause) =>
        new OrchestrationDispatchCommandError({
          message: "Could not create the agent workspace.",
          cause,
        }),
    ),
  );
  yield* projects
    .create({
      commandId: CommandId.make(`agent-create-${uuid}`),
      projectId,
      title: input.name,
      workspaceRoot,
      agentProfile: { ...input.agentProfile, archived: false, conversationThreadId: threadId },
    })
    .pipe(
      Effect.mapError(
        (cause) =>
          new OrchestrationDispatchCommandError({
            message: "Could not create the agent project.",
            cause,
          }),
      ),
    );
  return yield* Effect.gen(function* () {
    // This explicit choice follows ordinary project model-default semantics.
    yield* projects
      .update({
        commandId: CommandId.make(`agent-model-${uuid}`),
        projectId,
        defaultModelSelection: input.defaultModelSelection,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new OrchestrationDispatchCommandError({
              message: "Could not save the agent model.",
              cause,
            }),
        ),
      );
    if (input.enableAgentBrowserAccess !== undefined) {
      const settings = yield* ServerSettingsService;
      yield* settings
        .updateSettings({
          projectSettingsOverrides: {
            [projectId]: { enableAgentBrowserAccess: input.enableAgentBrowserAccess },
          },
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new OrchestrationDispatchCommandError({
                message: "Could not save the agent's browser access setting.",
                cause,
              }),
          ),
        );
    }
    yield* threads
      .dispatch({
        type: "thread.create",
        createdBy: "user",
        creationSource: "web",
        commandId: CommandId.make(`agent-thread-${uuid}`),
        threadId,
        projectId,
        title: input.name,
        modelSelection: input.defaultModelSelection,
        runtimeMode: DEFAULT_RUNTIME_MODE,
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        branch: null,
        worktreePath: null,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new OrchestrationDispatchCommandError({
              message: "Could not create the agent chat.",
              cause,
            }),
        ),
      );
    return { projectId, threadId };
  }).pipe(
    Effect.onError(() =>
      Effect.gen(function* () {
        yield* projects
          .delete({
            commandId: CommandId.make(`agent-create-cleanup-${uuid}`),
            projectId,
            force: true,
          })
          .pipe(Effect.ignoreCause({ log: true }));
        if (input.enableAgentBrowserAccess !== undefined) {
          const settings = yield* ServerSettingsService;
          yield* settings
            .updateSettings({ projectSettingsOverrides: { [projectId]: null } })
            .pipe(Effect.ignoreCause({ log: true }));
        }
      }),
    ),
  );
});

export class PersistentAgents extends Context.Service<
  PersistentAgents,
  {
    readonly create: (
      input: AgentCreateInput,
    ) => Effect.Effect<AgentCreateResult, OrchestrationDispatchCommandError>;
  }
>()("t3/orchestration-v2/PersistentAgents") {}
const make = Effect.gen(function* () {
  const context =
    yield* Effect.context<Effect.Services<ReturnType<typeof createPersistentAgentImpl>>>();
  return PersistentAgents.of({
    create: (input) => createPersistentAgentImpl(input).pipe(Effect.provide(context)),
  });
});
export const layer = Layer.effect(PersistentAgents, make);
export const createPersistentAgent = Effect.fn("PersistentAgents.create")(function* (
  input: AgentCreateInput,
) {
  return yield* (yield* PersistentAgents).create(input);
});

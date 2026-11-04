import {
  isRuntimeModeAbove,
  managedRuntimeModeCeilingMessage,
  ModelSelection,
  OrchestrationV2AppThread,
  ProjectId,
  ProviderInstanceId,
  RuntimeMode,
  ThreadId,
} from "@elysiatools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as NodePath from "@effect/platform-node/NodePath";
import * as Schema from "effect/Schema";

import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import * as ProviderAdapter from "@elysiatools/provider-core/server/ProviderAdapter";
import * as ServerSettings from "../serverSettings.ts";
import * as ProjectStore from "./ProjectStore.ts";

export class RuntimePolicyResolveError extends Schema.TaggedError<RuntimePolicyResolveError>()(
  "RuntimePolicyResolveError",
  {
    projectId: ProjectId,
    providerInstanceId: ProviderInstanceId,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Failed to resolve runtime policy for provider instance ${this.providerInstanceId} in project ${this.projectId}.`;
  }
}

/**
 * A turn would start in a mode above the policy's ceiling. The orchestrator refuses those when
 * they are dispatched; this catches the ones it never saw, such as a run resumed after a restart
 * on a thread whose mode predates the policy.
 */
export class RuntimePolicyAboveCeilingError extends Schema.TaggedError<RuntimePolicyAboveCeilingError>()(
  "RuntimePolicyAboveCeilingError",
  {
    threadId: ThreadId,
    runtimeMode: RuntimeMode,
    maxRuntimeMode: RuntimeMode,
    organization: Schema.String,
  },
) {
  override get message(): string {
    return `${managedRuntimeModeCeilingMessage(this.organization, this.maxRuntimeMode)} Switch this thread's mode to continue.`;
  }
}

export const isRuntimePolicyAboveCeilingError = Schema.is(RuntimePolicyAboveCeilingError);

export const RuntimePolicyV2Error = Schema.Union([
  RuntimePolicyResolveError,
  RuntimePolicyAboveCeilingError,
]);
export type RuntimePolicyV2Error = typeof RuntimePolicyV2Error.Type;

export const RuntimePolicyV2Override = Schema.Struct({
  cwd: Schema.optional(Schema.String),
  approvalPolicy: Schema.optional(Schema.Unknown),
  sandboxPolicy: Schema.optional(Schema.Unknown),
  reasoningEffort: Schema.optional(Schema.String),
});
export type RuntimePolicyV2Override = typeof RuntimePolicyV2Override.Type;

export interface RuntimePolicyV2Shape {
  readonly resolve: (input: {
    readonly thread: OrchestrationV2AppThread;
    readonly channelAgentProjectId?: ProjectId | undefined;
    readonly modelSelection: ModelSelection;
  }) => Effect.Effect<ProviderAdapter.ProviderAdapterV2RuntimePolicy, RuntimePolicyV2Error>;
}

export class RuntimePolicyV2 extends Context.Service<RuntimePolicyV2, RuntimePolicyV2Shape>()(
  "@elysiatools/server/orchestration-v2/RuntimePolicy/RuntimePolicyV2",
) {}

export const layer: Layer.Layer<RuntimePolicyV2> = Layer.succeed(RuntimePolicyV2, {
  resolve: Effect.fn("RuntimePolicyV2.resolve")(function (input) {
    return Effect.succeed({
      runtimeMode: input.thread.runtimeMode,
      interactionMode: input.thread.interactionMode,
      cwd: input.thread.worktreePath,
    });
  }),
});

function providerRuntimeMode(
  runtimeMode: RuntimeMode,
  supportedRuntimeModes: ReadonlyArray<RuntimeMode> | undefined,
): RuntimeMode {
  return supportedRuntimeModes === undefined ||
    supportedRuntimeModes.length === 0 ||
    supportedRuntimeModes.includes(runtimeMode)
    ? runtimeMode
    : "approval-required";
}

const refuseAboveCeiling = (
  managedPolicy: ServerSettings.ServerSettingsService["Service"]["managedPolicy"],
  thread: OrchestrationV2AppThread,
) => {
  const maxRuntimeMode = managedPolicy?.limits?.maxRuntimeMode;
  return managedPolicy !== undefined &&
    maxRuntimeMode !== undefined &&
    isRuntimeModeAbove(thread.runtimeMode, maxRuntimeMode)
    ? Effect.fail(
        new RuntimePolicyAboveCeilingError({
          threadId: thread.id,
          runtimeMode: thread.runtimeMode,
          maxRuntimeMode,
          organization: managedPolicy.organization,
        }),
      )
    : Effect.void;
};

/** Lays the policy's ceiling over another runtime policy, as `layerFromProjectStore` does. */
export const layerEnforcingCeiling: Layer.Layer<
  RuntimePolicyV2,
  never,
  RuntimePolicyV2 | ServerSettings.ServerSettingsService
> = Layer.effect(
  RuntimePolicyV2,
  Effect.gen(function* () {
    const base = yield* RuntimePolicyV2;
    const { managedPolicy } = yield* ServerSettings.ServerSettingsService;
    return RuntimePolicyV2.of({
      resolve: Effect.fn("RuntimePolicyV2.resolveWithinCeiling")(function* (input) {
        yield* refuseAboveCeiling(managedPolicy, input.thread);
        return yield* base.resolve(input);
      }),
    });
  }),
);

export const layerFromProjectStore: Layer.Layer<
  RuntimePolicyV2,
  never,
  | ProjectStore.ProjectStoreV2
  | ProviderInstanceRegistry.ProviderInstanceRegistry
  | ServerSettings.ServerSettingsService
> = Layer.effect(
  RuntimePolicyV2,
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const projects = yield* ProjectStore.ProjectStoreV2;
    const providerInstances = yield* ProviderInstanceRegistry.ProviderInstanceRegistry;
    // The same ceiling the orchestrator enforces, fixed for the server's life.
    const { managedPolicy } = yield* ServerSettings.ServerSettingsService;
    const maxRuntimeMode = managedPolicy?.limits?.maxRuntimeMode;
    return RuntimePolicyV2.of({
      resolve: Effect.fn("RuntimePolicyV2.resolve")(function* (input) {
        yield* refuseAboveCeiling(managedPolicy, input.thread);
        const instance = yield* providerInstances.getInstance(input.modelSelection.instanceId);
        const supportedRuntimeModes =
          instance === undefined
            ? undefined
            : (yield* instance.snapshot.getSnapshot).supportedRuntimeModes;
        const projectOption = yield* projects.get(input.thread.projectId).pipe(
          Effect.mapError(
            (cause) =>
              new RuntimePolicyResolveError({
                projectId: input.thread.projectId,
                providerInstanceId: input.modelSelection.instanceId,
                cause,
              }),
          ),
        );
        if (
          (Option.isNone(projectOption) && input.thread.worktreePath === null) ||
          (Option.isSome(projectOption) &&
            (projectOption.value.deletedAt !== null ||
              projectOption.value.agentProfile?.archived ||
              (projectOption.value.agentProfile?.group && !input.channelAgentProjectId)))
        ) {
          return yield* new RuntimePolicyResolveError({
            projectId: input.thread.projectId,
            providerInstanceId: input.modelSelection.instanceId,
            cause: "Project unavailable or persistent agent archived.",
          });
        }
        const project = Option.getOrUndefined(projectOption);
        let agent = project;
        if (input.channelAgentProjectId) {
          const group = project?.agentProfile?.group;
          const member = yield* projects.get(input.channelAgentProjectId).pipe(
            Effect.mapError(
              (cause) =>
                new RuntimePolicyResolveError({
                  projectId: input.thread.projectId,
                  providerInstanceId: input.modelSelection.instanceId,
                  cause,
                }),
            ),
          );
          if (
            !group ||
            project?.agentProfile?.conversationThreadId !== input.thread.id ||
            !group.memberProjectIds.includes(input.channelAgentProjectId) ||
            Option.isNone(member) ||
            member.value.deletedAt !== null ||
            !member.value.agentProfile ||
            member.value.agentProfile.archived ||
            member.value.agentProfile.group
          ) {
            return yield* new RuntimePolicyResolveError({
              projectId: input.thread.projectId,
              providerInstanceId: input.modelSelection.instanceId,
              cause: "The channel member is unavailable.",
            });
          }
          agent = member.value;
        }
        const group = project?.agentProfile?.group;
        const members = group
          ? yield* Effect.forEach(group.memberProjectIds, (id) =>
              projects.get(id).pipe(
                Effect.mapError(
                  (cause) =>
                    new RuntimePolicyResolveError({
                      projectId: input.thread.projectId,
                      providerInstanceId: input.modelSelection.instanceId,
                      cause,
                    }),
                ),
              ),
            )
          : [];
        const roster = members
          .flatMap((member) =>
            Option.isSome(member) &&
            member.value.deletedAt === null &&
            member.value.agentProfile &&
            !member.value.agentProfile.archived &&
            !member.value.agentProfile.group
              ? [`${member.value.title} (projectId: ${member.value.projectId})`]
              : [],
          )
          .join(", ");
        const cwd =
          project?.agentProfile?.group?.workspaceRoot ??
          input.thread.worktreePath ??
          project!.workspaceRoot;
        return ProviderAdapter.ProviderAdapterV2RuntimePolicy.make({
          runtimeMode: providerRuntimeMode(input.thread.runtimeMode, supportedRuntimeModes),
          interactionMode: input.thread.interactionMode,
          cwd,
          ...(agent?.agentProfile
            ? {
                persistentAgent: {
                  name: agent.title,
                  ...(group ? { channelThreadId: input.thread.id } : {}),
                  ...(agent.agentProfile.title ? { title: agent.agentProfile.title } : {}),
                  instructions: [
                    agent.agentProfile.instructions,
                    ...(project?.agentProfile?.group
                      ? [
                          `You are responding as ${agent.title} in channel ${project.title}. Keep all work and responses in this channel.`,
                          "Messages here are normal conversation, not external delegated tasks. Answer the latest message directly. Do not send a task receipt or a **Task:** summary unless the user asks for one.",
                          `Channel members: ${roster}. When another member's contribution is needed, call elysia_thread_send with threadId ${input.thread.id}, channelAgentProjectId set to that member's projectId, mode queue, and a specific message. This queues their response here with the shared channel history. Do not open their standalone chat or repeatedly hand work back and forth.`,
                          `Channel description: ${project.agentProfile.instructions}`,
                        ]
                      : []),
                  ].join("\n\n"),
                  memoryDirectory: path.join(agent.workspaceRoot, ".claude", "memory"),
                },
              }
            : {}),
          ...(maxRuntimeMode === undefined ? {} : { maxRuntimeMode }),
        });
      }),
    });
  }),
).pipe(Layer.provide(NodePath.layer));

export function layerWithOverride(
  override: RuntimePolicyV2Override,
): Layer.Layer<RuntimePolicyV2, never, RuntimePolicyV2> {
  return Layer.effect(
    RuntimePolicyV2,
    Effect.gen(function* () {
      const base = yield* RuntimePolicyV2;
      return {
        resolve: (input) =>
          base.resolve(input).pipe(
            Effect.map((policy) =>
              ProviderAdapter.ProviderAdapterV2RuntimePolicy.make({
                ...policy,
                ...(override.cwd === undefined ? {} : { cwd: override.cwd }),
                ...(override.approvalPolicy === undefined
                  ? {}
                  : { approvalPolicy: override.approvalPolicy }),
                ...(override.sandboxPolicy === undefined
                  ? {}
                  : { sandboxPolicy: override.sandboxPolicy }),
                ...(override.reasoningEffort === undefined
                  ? {}
                  : { reasoningEffort: override.reasoningEffort }),
              }),
            ),
          ),
      } satisfies RuntimePolicyV2Shape;
    }),
  );
}

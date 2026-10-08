import {
  ModelSelection,
  OrchestrationV2AppThread,
  ProjectId,
  ProviderInstanceId,
  type RuntimeMode,
} from "@elysiatools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as NodePath from "@effect/platform-node/NodePath";
import * as Schema from "effect/Schema";

import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import {
  ProviderAdapterV2RuntimePolicy,
  type ProviderAdapterV2RuntimePolicy as ProviderAdapterV2RuntimePolicyType,
} from "./ProviderAdapter.ts";
import * as ProjectStore from "./ProjectStore.ts";

/**
 * ERRORS
 */
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

export const RuntimePolicyV2Error = Schema.Union([RuntimePolicyResolveError]);
export type RuntimePolicyV2Error = typeof RuntimePolicyV2Error.Type;

export const RuntimePolicyV2Override = Schema.Struct({
  cwd: Schema.optional(Schema.String),
  approvalPolicy: Schema.optional(Schema.Unknown),
  sandboxPolicy: Schema.optional(Schema.Unknown),
  reasoningEffort: Schema.optional(Schema.String),
});
export type RuntimePolicyV2Override = typeof RuntimePolicyV2Override.Type;

/**
 * SERVICE DEFINITION
 */
export interface RuntimePolicyV2Shape {
  readonly resolve: (input: {
    readonly thread: OrchestrationV2AppThread;
    readonly channelAgentProjectId?: ProjectId | undefined;
    readonly modelSelection: ModelSelection;
  }) => Effect.Effect<ProviderAdapterV2RuntimePolicyType, RuntimePolicyV2Error>;
}

export class RuntimePolicyV2 extends Context.Service<RuntimePolicyV2, RuntimePolicyV2Shape>()(
  "@elysiatools/server/orchestration-v2/RuntimePolicy/RuntimePolicyV2",
) {}

/**
 * IMPLEMENTATIONS
 */
export const layer: Layer.Layer<RuntimePolicyV2> = Layer.succeed(RuntimePolicyV2, {
  resolve: (input) =>
    Effect.succeed({
      runtimeMode: input.thread.runtimeMode,
      interactionMode: input.thread.interactionMode,
      cwd: input.thread.worktreePath,
    }),
});

/**
 * The mode a provider runs a thread in. A mode the provider does not offer
 * (a thread set before it stopped offering it, or a stale client) runs in
 * Supervised rather than having Elysia imitate it.
 */
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

export const layerFromProjectStore: Layer.Layer<
  RuntimePolicyV2,
  never,
  ProjectStore.ProjectStoreV2 | ProviderInstanceRegistry.ProviderInstanceRegistry
> = Layer.effect(
  RuntimePolicyV2,
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const projects = yield* ProjectStore.ProjectStoreV2;
    const providerInstances = yield* ProviderInstanceRegistry.ProviderInstanceRegistry;
    return RuntimePolicyV2.of({
      resolve: Effect.fn("RuntimePolicyV2.resolve")(function* (input) {
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
        return ProviderAdapterV2RuntimePolicy.make({
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
              ProviderAdapterV2RuntimePolicy.make({
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

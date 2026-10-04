import {
  type AgentCreateInput,
  type AgentResetInput,
  type AgentConversationPreviewsInput,
  type AgentConversationPreviewsResult,
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
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Option from "effect/Option";

import { ServerConfig } from "../config.ts";
import { ProviderRegistry } from "../provider/Services/ProviderRegistry.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as ThreadManagement from "./ThreadManagementService.ts";
import * as ProviderSessions from "./ProviderSessionManager.ts";
import { makeKeyedSerialExecutor } from "./KeyedSerialExecutor.ts";
import * as ProjectStore from "./ProjectStore.ts";

const isDispatchError = Schema.is(OrchestrationDispatchCommandError);

const createPersistentAgentImpl = Effect.fn("createPersistentAgent")(function* (
  input: AgentCreateInput,
) {
  const projects = yield* ProjectService.ProjectService;
  const threads = yield* ThreadManagement.ThreadManagementService;
  const config = yield* ServerConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const group = input.agentProfile.group;
  if (group) {
    if (
      group.memberProjectIds.length < 2 ||
      group.memberProjectIds.length > 32 ||
      new Set(group.memberProjectIds).size !== group.memberProjectIds.length ||
      !group.memberProjectIds.includes(group.leadProjectId)
    ) {
      return yield* new OrchestrationDispatchCommandError({
        message: "Choose distinct agents and a lead who belongs to the channel.",
      });
    }
    const store = yield* ProjectStore.ProjectStoreV2;
    for (const memberId of group.memberProjectIds) {
      const member = yield* store.get(memberId).pipe(
        Effect.mapError(
          (cause) =>
            new OrchestrationDispatchCommandError({
              message: "Could not read the channel's agents.",
              cause,
            }),
        ),
      );
      if (
        Option.isNone(member) ||
        member.value.deletedAt !== null ||
        !member.value.agentProfile?.conversationThreadId ||
        member.value.agentProfile.archived ||
        member.value.agentProfile.group
      ) {
        return yield* new OrchestrationDispatchCommandError({
          message: "Groups need at least two available individual agents.",
        });
      }
    }
  }
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

const resetPersistentAgentImpl = Effect.fn("PersistentAgents.reset")(function* (
  input: AgentResetInput,
) {
  const projects = yield* ProjectService.ProjectService;
  const threads = yield* ThreadManagement.ThreadManagementService;
  const sessions = yield* ProviderSessions.ProviderSessionManagerV2;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const project = yield* projects.getById(input.projectId);
  if (
    Option.isNone(project) ||
    !project.value.agentProfile ||
    project.value.agentProfile.archived
  ) {
    return yield* new OrchestrationDispatchCommandError({
      message: "Choose an available agent or channel.",
    });
  }
  const owner = project.value;
  const profile = owner.agentProfile!;
  // A retried reset must return its replacement instead of clearing the fresh chat.
  if (profile.conversationThreadId === input.threadId)
    return { projectId: input.projectId, threadId: input.threadId };
  if (
    profile.conversationThreadId !== input.previousThreadId ||
    input.threadId === input.previousThreadId
  ) {
    return yield* new OrchestrationDispatchCommandError({
      message: "The conversation changed. Reopen the panel and try again.",
    });
  }
  const previous = yield* threads.getThreadRecords(input.previousThreadId, ["providerSessions"]);
  if (previous.thread.projectId !== input.projectId) {
    return yield* new OrchestrationDispatchCommandError({
      message: "The conversation does not belong to this agent.",
    });
  }
  // Validate before committing deletion; never follow memory links outside its owner.
  const workspace = yield* fs.realPath(owner.workspaceRoot);
  const claude = path.join(workspace, ".claude");
  if (yield* fs.exists(claude)) {
    if ((yield* fs.realPath(claude)) !== claude) {
      return yield* new OrchestrationDispatchCommandError({
        message: "The agent memory folder must stay within its workspace.",
      });
    }
  }
  const memory = path.join(claude, "memory");
  if (yield* fs.exists(memory)) {
    if ((yield* fs.realPath(memory)) !== memory) {
      return yield* new OrchestrationDispatchCommandError({
        message: "The agent memory folder must stay within its workspace.",
      });
    }
  }
  yield* threads.dispatch({
    type: "thread.create",
    createdBy: "user",
    creationSource: "web",
    commandId: CommandId.make(`${input.commandId}:create`),
    threadId: input.threadId,
    projectId: input.projectId,
    title: owner.title,
    modelSelection: owner.defaultModelSelection ?? previous.thread.modelSelection,
    runtimeMode: previous.thread.runtimeMode,
    interactionMode: previous.thread.interactionMode,
    branch: null,
    worktreePath: null,
  });
  yield* threads.dispatch({
    type: "thread.delete",
    threadId: input.previousThreadId,
    commandId: CommandId.make(`${input.commandId}:delete`),
  });
  // Await native teardown before removing memory, so a running turn cannot write it back.
  for (const session of previous.providerSessions) {
    yield* sessions.detach({
      providerSessionId: session.id,
      threadId: input.previousThreadId,
      revokeMcpCredential: true,
      detail: "Chat and memory cleared.",
    });
  }
  yield* fs.remove(memory, { recursive: true, force: true });
  yield* fs.makeDirectory(memory, { recursive: true });
  yield* projects.resetAgentConversation({
    ...input,
    commandId: CommandId.make(`${input.commandId}:link`),
  });
  return { projectId: input.projectId, threadId: input.threadId };
});

const conversationPreviewsImpl = Effect.fn("PersistentAgents.conversationPreviews")(function* (
  input: AgentConversationPreviewsInput,
) {
  if (input.projectIds.length > 100)
    return yield* new OrchestrationDispatchCommandError({
      message: "Request at most 100 agent previews at a time.",
    });
  if (input.projectIds.length === 0) return [];
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<AgentConversationPreviewsResult[number]>`
    SELECT project.project_id AS projectId, thread.thread_id AS threadId,
      SUBSTR(COALESCE((
        SELECT json_extract(record.value, '$.payload.handoff.ask')
        FROM json_each(message.payload_json, '$.context.records') record
        WHERE json_extract(record.value, '$.kind') = 'elysia-agent-delegation-source'
          AND json_type(record.value, '$.payload.handoff.ask') = 'text'
        LIMIT 1
      ), json_extract(message.payload_json, '$.text')), 1, 240) AS text,
      json_extract(message.payload_json, '$.updatedAt') AS updatedAt
    FROM projection_projects project
    JOIN orchestration_v2_projection_threads thread
      ON thread.thread_id = json_extract(project.agent_profile_json, '$.conversationThreadId')
      AND thread.project_id = project.project_id AND thread.deleted_at IS NULL
    JOIN orchestration_v2_projection_messages message
      ON message.thread_id = thread.thread_id
      AND message.message_id = (
        SELECT json_extract(item.payload_json, '$.messageId')
        FROM orchestration_v2_projection_turn_items item
        LEFT JOIN orchestration_v2_projection_runs run ON run.thread_id = item.thread_id AND run.run_id = item.run_id
        WHERE item.thread_id = thread.thread_id AND item.type IN ('user_message', 'assistant_message')
          AND (item.run_id IS NULL OR run.status != 'rolled_back')
          AND LENGTH(TRIM(json_extract(item.payload_json, '$.text'))) > 0
        ORDER BY item.ordinal DESC LIMIT 1
      )
    WHERE project.project_id IN ${sql.in([...new Set(input.projectIds)])}
      AND project.deleted_at IS NULL AND project.agent_profile_json IS NOT NULL
  `.pipe(
    Effect.mapError(
      (cause) =>
        new OrchestrationDispatchCommandError({
          message: "Could not read agent previews. Try again.",
          cause,
        }),
    ),
  );
  return rows.map((row) => ({ ...row, text: row.text.slice(0, 240) }));
});

export class PersistentAgents extends Context.Service<
  PersistentAgents,
  {
    readonly conversationPreviews: (
      input: AgentConversationPreviewsInput,
    ) => Effect.Effect<AgentConversationPreviewsResult, OrchestrationDispatchCommandError>;
    readonly reset: (
      input: AgentResetInput,
    ) => Effect.Effect<AgentCreateResult, OrchestrationDispatchCommandError>;
    readonly create: (
      input: AgentCreateInput,
    ) => Effect.Effect<AgentCreateResult, OrchestrationDispatchCommandError>;
  }
>()("t3/orchestration-v2/PersistentAgents") {}
const make = Effect.gen(function* () {
  const context = yield* Effect.context<
    | Effect.Services<ReturnType<typeof createPersistentAgentImpl>>
    | Effect.Services<ReturnType<typeof resetPersistentAgentImpl>>
    | SqlClient.SqlClient
  >();
  const resets = yield* makeKeyedSerialExecutor<ProjectId>();
  return PersistentAgents.of({
    reset: (input) =>
      resets.withLock(
        input.projectId,
        resetPersistentAgentImpl(input).pipe(
          Effect.provide(context),
          Effect.uninterruptible,
          Effect.mapError((cause) =>
            isDispatchError(cause)
              ? cause
              : new OrchestrationDispatchCommandError({
                  message: "Could not clear the chat and memory. Try again.",
                  cause,
                }),
          ),
        ),
      ),
    conversationPreviews: (input) => conversationPreviewsImpl(input).pipe(Effect.provide(context)),
    create: (input) => createPersistentAgentImpl(input).pipe(Effect.provide(context)),
  });
});
export const layer = Layer.effect(PersistentAgents, make);
export const createPersistentAgent = Effect.fn("PersistentAgents.create")(function* (
  input: AgentCreateInput,
) {
  return yield* (yield* PersistentAgents).create(input);
});

export const getAgentConversationPreviews = Effect.fn("PersistentAgents.conversationPreviews")(
  function* (input: AgentConversationPreviewsInput) {
    return yield* (yield* PersistentAgents).conversationPreviews(input);
  },
);

export const resetPersistentAgent = Effect.fn("PersistentAgents.reset")(function* (
  input: AgentResetInput,
) {
  return yield* (yield* PersistentAgents).reset(input);
});

import {
  AgentProfile,
  CommandId,
  MessageId,
  ProjectId,
  OrchestrationDispatchCommandError,
  ServerSettingsError,
  ProviderInstanceId,
  ServerProvider,
  ThreadId,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { ServerConfig } from "../config.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { ProviderRegistry } from "../provider/Services/ProviderRegistry.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { ProjectionProjectRepositoryLive } from "../persistence/Layers/ProjectionProjects.ts";
import * as RepositoryIdentityResolver from "../project/RepositoryIdentityResolver.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./Layers/ProjectionSnapshotQuery.ts";
import { ProjectionSnapshotQuery } from "./Services/ProjectionSnapshotQuery.ts";
import * as ThreadBackgroundLiveness from "./ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "./ThreadPlanProgress.ts";
import { ProjectionProjectRepository } from "../persistence/Services/ProjectionProjects.ts";
import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";
import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";
import { normalizeDispatchCommand } from "./Normalizer.ts";
import { createPersistentAgent, type PersistentAgentCommand } from "./PersistentAgents.ts";

const modelSelection = { instanceId: ProviderInstanceId.make("claude"), model: "kimi-k3" };
const existingProjectId = ProjectId.make("existing-project");
const profile = Schema.decodeSync(AgentProfile)({
  instructions: "Help with editorial work.",
  title: "Editorial assistant",
  avatar: { preset: "briefcase", color: "blue" },
  notificationsEnabled: true,
  archived: false,
});
const provider = Schema.decodeSync(ServerProvider)({
  instanceId: modelSelection.instanceId,
  driver: "claudeAgent",
  enabled: true,
  installed: true,
  version: "0.3.8",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: "2026-10-01T00:00:00Z",
  models: [{ slug: modelSelection.model, name: "Kimi K3", isCustom: false, capabilities: null }],
});
const registryLayer = Layer.succeed(ProviderRegistry, {
  getProviders: Effect.succeed([provider]),
  refresh: () => Effect.succeed([provider]),
  refreshInstance: () => Effect.succeed([provider]),
  refreshWorkspaceSnapshot: () => Effect.succeed([provider]),
  getProviderMaintenanceCapabilitiesForInstance: () => Effect.die("unused"),
  setProviderMaintenanceActionState: () => Effect.succeed([provider]),
  streamChanges: Stream.empty,
});
const testLayer = Layer.mergeAll(
  ServerConfig.layerTest(process.cwd(), { prefix: "elysia-persistent-agents-" }),
  ServerSettingsService.layerTest({
    projectSettingsOverrides: { [existingProjectId]: { enableAgentBrowserAccess: false } },
  }),
  registryLayer,
  WorkspacePaths.layer,
  ProjectionProjectRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
  OrchestrationProjectionSnapshotQueryLive.pipe(
    Layer.provide(ThreadBackgroundLiveness.layer),
    Layer.provide(ThreadPlanProgress.layer),
    Layer.provide(
      Layer.succeed(RepositoryIdentityResolver.RepositoryIdentityResolver, {
        resolve: () => Effect.die("Agent workspaces must never resolve ancestor repositories"),
      }),
    ),
    Layer.provideMerge(SqlitePersistenceMemory),
  ),
).pipe(Layer.provideMerge(NodeServices.layer));

it.layer(testLayer)("persistent agents", (it) => {
  for (const enabled of [true, false]) {
    it.effect(`persists browser access ${enabled} before creating the native conversation`, () =>
      Effect.gen(function* () {
        const settings = yield* ServerSettingsService;
        const result = yield* createPersistentAgent(
          {
            name: "Edna",
            agentProfile: profile,
            defaultModelSelection: modelSelection,
            enableAgentBrowserAccess: enabled,
          },
          (command) =>
            Effect.gen(function* () {
              if (command.type === "thread.create") {
                const current = yield* settings.getSettings.pipe(Effect.orDie);
                assert.equal(
                  current.projectSettingsOverrides[command.projectId]?.enableAgentBrowserAccess,
                  enabled,
                );
              }
            }),
        );
        const current = yield* settings.getSettings;
        assert.deepEqual(current.projectSettingsOverrides[result.projectId], {
          enableAgentBrowserAccess: enabled,
        });
        assert.deepEqual(current.projectSettingsOverrides[existingProjectId], {
          enableAgentBrowserAccess: false,
        });
      }),
    );
  }

  it.effect(
    "removes browser overrides and the unfinished agent when conversation creation fails",
    () =>
      Effect.gen(function* () {
        const settings = yield* ServerSettingsService;
        const commands: PersistentAgentCommand[] = [];
        const error = yield* createPersistentAgent(
          {
            name: "Edna",
            agentProfile: profile,
            defaultModelSelection: modelSelection,
            enableAgentBrowserAccess: false,
          },
          (command) =>
            Effect.gen(function* () {
              commands.push(command);
              if (command.type === "thread.create") {
                assert.equal(
                  (yield* settings.getSettings.pipe(Effect.orDie)).projectSettingsOverrides[
                    command.projectId
                  ]?.enableAgentBrowserAccess,
                  false,
                );
                return yield* new OrchestrationDispatchCommandError({
                  message: "Could not create the native conversation.",
                });
              }
            }),
        ).pipe(Effect.flip);
        assert.include(error.message, "native conversation");
        const create = commands.find((command) => command.type === "project.create")!;
        assert.deepEqual(commands.at(-1), {
          type: "project.delete",
          commandId: CommandId.make(`agent-create-cleanup-${create.projectId}`),
          projectId: create.projectId,
          force: true,
        });
        const current = yield* settings.getSettings;
        assert.isUndefined(current.projectSettingsOverrides[create.projectId]);
        assert.deepEqual(current.projectSettingsOverrides[existingProjectId], {
          enableAgentBrowserAccess: false,
        });
      }),
  );

  it.effect("does not create a conversation when browser settings cannot be persisted", () =>
    Effect.gen(function* () {
      const settings = yield* ServerSettingsService;
      const commands: PersistentAgentCommand[] = [];
      let failPersistence = true;
      const error = yield* createPersistentAgent(
        {
          name: "Edna",
          agentProfile: profile,
          defaultModelSelection: modelSelection,
          enableAgentBrowserAccess: false,
        },
        (command) =>
          Effect.sync(() => {
            commands.push(command);
          }),
      ).pipe(
        Effect.provideService(ServerSettingsService, {
          ...settings,
          updateSettings: (patch) => {
            if (failPersistence) {
              failPersistence = false;
              return Effect.fail(
                new ServerSettingsError({
                  settingsPath: "/test/settings.json",
                  operation: "write-file",
                  cause: new Error("Disk full"),
                }),
              );
            }
            return settings.updateSettings(patch);
          },
        }),
        Effect.flip,
      );
      assert.include(error.message, "browser access setting");
      assert.isFalse(commands.some((command) => command.type === "thread.create"));
      const create = commands.find((command) => command.type === "project.create")!;
      assert.equal(commands.at(-1)?.type, "project.delete");
      assert.isUndefined((yield* settings.getSettings).projectSettingsOverrides[create.projectId]);
    }),
  );

  it.effect(
    "creates one durable workspace and conversation, preserves native model and profile across edits",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const projects = yield* ProjectionProjectRepository;
        let state = createEmptyReadModel("2026-10-01T00:00:00Z");
        let sequence = 0;
        const dispatch = (command: PersistentAgentCommand) =>
          Effect.gen(function* () {
            const decided = yield* decideOrchestrationCommand({ command, readModel: state });
            for (const event of Array.isArray(decided) ? decided : [decided]) {
              state = yield* projectEvent(state, { ...event, sequence: ++sequence });
            }
          }).pipe(
            Effect.mapError(
              (cause) =>
                new OrchestrationDispatchCommandError({ message: "fixture dispatch", cause }),
            ),
          );
        const result = yield* createPersistentAgent(
          { name: "Edna", agentProfile: profile, defaultModelSelection: modelSelection },
          dispatch,
        );
        const project = state.projects[0]!;
        const thread = state.threads[0]!;
        assert.equal(project.id, result.projectId);
        assert.equal(thread.id, result.threadId);
        assert.equal(thread.projectId, project.id);
        assert.equal(project.agentProfile?.conversationThreadId, result.threadId);
        assert.deepEqual(project.defaultModelSelection, modelSelection);
        assert.deepEqual(thread.modelSelection, modelSelection);
        assert.equal(thread.worktreePath, null);
        assert.equal(thread.branch, null);
        assert.isTrue(yield* fs.exists(`${project.workspaceRoot}/.claude/memory`));
        assert.isFalse(yield* fs.exists(`${project.workspaceRoot}/.git`));
        yield* projects.upsert({
          ...project,
          projectId: project.id,
          defaultThreadEnvMode: null,
          autoPull: false,
        });
        const stored = Option.getOrThrow(yield* projects.getById({ projectId: project.id }));
        assert.deepEqual(stored.agentProfile, project.agentProfile);
        const query = yield* ProjectionSnapshotQuery;
        const shell = Option.getOrThrow(yield* query.getProjectShellById(project.id));
        assert.deepEqual(shell.agentProfile, project.agentProfile);
        assert.equal(shell.repositoryIdentity, null);
        assert.deepEqual(
          (yield* query.getShellSnapshot()).projects[0]?.agentProfile,
          project.agentProfile,
        );
        for (const historyImport of [false, true]) {
          const duplicateConversation = yield* decideOrchestrationCommand({
            readModel: state,
            command: {
              type: "thread.create",
              commandId: CommandId.make(`duplicate-agent-conversation-${historyImport}`),
              threadId: ThreadId.make(`another-agent-conversation-${historyImport}`),
              projectId: project.id,
              title: "Another conversation",
              modelSelection,
              runtimeMode: "full-access",
              interactionMode: "default",
              branch: null,
              worktreePath: null,
              createdAt: "2026-10-01T00:00:00Z",
              ...(historyImport ? { historyImport: true } : {}),
            },
          }).pipe(Effect.flip);
          assert.include(duplicateConversation.message, "existing conversation");
        }
        const movedConversation = yield* decideOrchestrationCommand({
          readModel: state,
          command: {
            type: "thread.meta.update",
            commandId: CommandId.make("move-agent-conversation"),
            threadId: thread.id,
            worktreePath: "/tmp/another-worktree",
          },
        }).pipe(Effect.flip);
        assert.include(movedConversation.message, "app-owned workspace");
        yield* dispatch({
          type: "project.meta.update",
          commandId: CommandId.make("retain-agent-workspace"),
          projectId: project.id,
          workspaceRoot: project.workspaceRoot,
        });
        yield* dispatch({
          type: "project.meta.update",
          commandId: CommandId.make("edit-agent"),
          projectId: project.id,
          agentProfile: {
            ...profile,
            instructions: "Review contracts.",
            archived: true,
          },
        });
        assert.equal(state.projects[0]?.agentProfile?.archived, true);
        assert.equal(state.projects[0]?.agentProfile?.instructions, "Review contracts.");
        const archivedError = yield* decideOrchestrationCommand({
          readModel: state,
          command: {
            type: "thread.turn.start",
            commandId: CommandId.make("archived-message"),
            threadId: result.threadId,
            message: {
              messageId: MessageId.make("archived-message"),
              role: "user",
              text: "Continue working",
              attachments: [],
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            createdAt: "2026-10-01T00:00:01Z",
          },
        }).pipe(Effect.flip);
        assert.include(archivedError.message, "Restore this agent");
        assert.equal(state.projects[0]?.agentProfile?.conversationThreadId, result.threadId);
        for (const type of ["thread.archive", "thread.delete"] as const) {
          const hiddenConversation = yield* decideOrchestrationCommand({
            readModel: state,
            command: {
              type,
              commandId: CommandId.make(`hide-agent-conversation-${type}`),
              threadId: result.threadId,
            },
          }).pipe(Effect.flip);
          assert.include(hiddenConversation.message, "Archive the agent instead");
        }
        assert.equal(state.threads[0]?.archivedAt, null);
        assert.equal(state.threads[0]?.deletedAt, null);
        yield* dispatch({
          type: "project.meta.update",
          commandId: CommandId.make("move-agent"),
          projectId: project.id,
          workspaceRoot: "/tmp/moved-agent",
        }).pipe(Effect.flip);
        assert.equal(state.projects[0]?.workspaceRoot, project.workspaceRoot);
        yield* dispatch({
          type: "project.meta.update",
          commandId: CommandId.make("restore-agent"),
          projectId: project.id,
          agentProfile: { ...state.projects[0]!.agentProfile!, archived: false },
        });
        assert.equal(state.projects[0]?.agentProfile?.conversationThreadId, result.threadId);
        assert.equal(state.threads.length, 1);
        assert.equal(state.projects[0]?.workspaceRoot, project.workspaceRoot);
        const legacyArchivedState = {
          ...state,
          threads: state.threads.map((thread) => ({
            ...thread,
            archivedAt: "2026-10-01T00:00:02Z",
          })),
        };
        const recoveredConversation = yield* decideOrchestrationCommand({
          readModel: legacyArchivedState,
          command: {
            type: "thread.unarchive",
            commandId: CommandId.make("recover-agent-conversation"),
            threadId: result.threadId,
          },
        });
        assert.equal(Array.isArray(recoveredConversation), false);
        assert.equal(
          (Array.isArray(recoveredConversation) ? recoveredConversation[0] : recoveredConversation)
            ?.type,
          "thread.unarchived",
        );
        yield* dispatch({
          type: "project.delete",
          commandId: CommandId.make("dispose-agent-project"),
          projectId: project.id,
          force: true,
        });
        assert.isNotNull(state.projects[0]?.deletedAt);
        assert.isNotNull(state.threads[0]?.deletedAt);
      }),
  );

  it.effect("rejects raw agent creation and conversion of an ordinary project", () =>
    Effect.gen(function* () {
      const create = {
        type: "project.create" as const,
        commandId: CommandId.make("raw-agent"),
        projectId: ProjectId.make("ordinary-project"),
        title: "Ordinary",
        workspaceRoot: "/tmp/arbitrary-repository",
        createdAt: "2026-10-01T00:00:00Z",
      };
      const rejected = yield* normalizeDispatchCommand({ ...create, agentProfile: profile }).pipe(
        Effect.flip,
      );
      assert.include(rejected.message, "agents.create");
      const empty = createEmptyReadModel(create.createdAt);
      const event = yield* decideOrchestrationCommand({ readModel: empty, command: create });
      const existing = yield* projectEvent(empty, {
        ...(Array.isArray(event) ? event[0] : event),
        sequence: 1,
      });
      const conversion = yield* decideOrchestrationCommand({
        readModel: existing,
        command: {
          type: "project.meta.update",
          commandId: CommandId.make("convert-project"),
          projectId: create.projectId,
          agentProfile: profile,
        },
      }).pipe(Effect.flip);
      assert.include(conversion.message, "Ordinary projects cannot");
    }),
  );

  it.effect("rejects models outside the enabled native Elysia catalog before dispatch", () =>
    Effect.gen(function* () {
      let dispatched = false;
      const error = yield* createPersistentAgent(
        {
          name: "Edna",
          agentProfile: profile,
          defaultModelSelection: { ...modelSelection, model: "unavailable-model" },
        },
        () =>
          Effect.sync(() => {
            dispatched = true;
          }),
      ).pipe(Effect.flip);
      assert.include(error.message, "available Elysia model");
      assert.equal(dispatched, false);
    }),
  );
});

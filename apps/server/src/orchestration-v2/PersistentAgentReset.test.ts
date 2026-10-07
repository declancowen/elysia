import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  AgentResetInput,
  CommandId,
  OrchestrationV2AppThread,
  OrchestrationV2ThreadProjection,
  Project,
  ProjectId,
  ProviderSessionId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { ServerConfig } from "../config.ts";
import { ProviderRegistry } from "../provider/Services/ProviderRegistry.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import * as Projects from "../project/ProjectService.ts";
import * as Threads from "./ThreadManagementService.ts";
import * as Store from "./ProjectStore.ts";
import * as Sessions from "./ProviderSessionManager.ts";
import { CodexProviderCapabilitiesV2 } from "./Adapters/CodexAdapterV2.ts";
import * as PersistentAgents from "./PersistentAgents.ts";

const decodeProject = Schema.decodeUnknownEffect(Project);
const decodeThread = Schema.decodeUnknownEffect(OrchestrationV2AppThread);
const decodeProjection = Schema.decodeUnknownEffect(OrchestrationV2ThreadProjection);

for (const scenario of [
  "agent",
  "channel",
  "linked-memory",
  "failed-detach",
  "failed-link",
] as const) {
  const channel = scenario === "channel";
  it.effect(`resets ${scenario} memory safely and retries without erasing the replacement`, () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspace = yield* fs.makeTempDirectoryScoped({ prefix: "elysia-reset-" });
      const memory = path.join(workspace, ".claude", "memory");
      yield* fs.makeDirectory(memory, { recursive: true });
      yield* fs.writeFileString(
        path.join(memory, "MEMORY.md"),
        "Remember the previous conversation",
      );
      if (scenario === "linked-memory") {
        const outside = yield* fs.makeTempDirectoryScoped({ prefix: "elysia-other-memory-" });
        yield* fs.writeFileString(path.join(outside, "MEMORY.md"), "Other agent memory");
        yield* fs.remove(memory, { recursive: true });
        yield* fs.symlink(outside, memory);
      }
      const sibling = path.join(workspace, "work.txt");
      yield* fs.writeFileString(sibling, "Keep workspace files");
      const projectId = ProjectId.make("agent");
      const previousThreadId = ThreadId.make("previous");
      const threadId = ThreadId.make("fresh");
      let owner = yield* decodeProject({
        id: projectId,
        title: "Alex",
        workspaceRoot: workspace,
        defaultModelSelection: { instanceId: "claudeAgent", model: "deepseek-v4.1-flash" },
        scripts: [],
        createdAt: "2026-10-04T00:00:00Z",
        updatedAt: "2026-10-04T00:00:00Z",
        deletedAt: null,
        agentProfile: {
          instructions: "Review the product",
          avatar: { preset: "brain", color: "blue" },
          notificationsEnabled: true,
          archived: false,
          conversationThreadId: previousThreadId,
          ...(channel ? { group: { memberProjectIds: ["one", "two"], leadProjectId: "one" } } : {}),
        },
      });
      const profile = owner.agentProfile!;
      const at = DateTime.makeUnsafe("2026-10-04T00:00:00Z");
      const old = yield* decodeThread({
        id: previousThreadId,
        projectId,
        title: "Alex",
        providerInstanceId: "claudeAgent",
        modelSelection: owner.defaultModelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        activeProviderThreadId: null,
        lineage: {
          rootThreadId: previousThreadId,
          parentThreadId: null,
          relationshipToParent: null,
        },
        forkedFrom: null,
        createdAt: at,
        updatedAt: at,
        archivedAt: null,
        deletedAt: null,
        createdBy: "user",
        creationSource: "web",
      });
      const projection = yield* decodeProjection({
        thread: old,
        runs: [],
        attempts: [],
        nodes: [],
        subagents: [],
        providerThreads: [],
        providerTurns: [],
        runtimeRequests: [],
        messages: [],
        plans: [],
        turnItems: [],
        checkpointScopes: [],
        checkpoints: [],
        contextHandoffs: [],
        contextTransfers: [],
        visibleTurnItems: [],
        updatedAt: at,
        providerSessions: [
          {
            id: "old-session",
            driver: "claudeAgent",
            providerInstanceId: "claudeAgent",
            status: "running",
            cwd: workspace,
            model: "deepseek-v4.1-flash",
            capabilities: CodexProviderCapabilitiesV2,
            createdAt: at,
            updatedAt: at,
            lastError: null,
          },
        ],
      });
      let deleted = false;
      let detached = false;
      let creations = 0;
      let failNext = true;
      const dispatched = new Set<string>();
      const recovered = yield* Deferred.make<void>();
      const dependencies = Layer.mergeAll(
        NodeServices.layer,
        ServerConfig.layerTest(process.cwd(), { prefix: "agent-reset-config-" }).pipe(
          Layer.provide(NodeServices.layer),
        ),
        Layer.mock(ProviderRegistry)({}),
        Layer.mock(ServerSettingsService)({}),
        Layer.mock(Store.ProjectStoreV2)({}),
        Layer.mock(Projects.ProjectService)({
          getById: () => Effect.succeed(Option.some(owner)),
          resetAgentConversation: (input) =>
            Effect.gen(function* () {
              assert.isTrue(deleted && detached);
              if (scenario === "failed-link" && failNext) {
                failNext = false;
                return yield* new Projects.ProjectOperationError({
                  projectId,
                  operation: "dispatch-project-command",
                  cause: "Link unavailable",
                });
              }
              owner = {
                ...owner,
                agentProfile: { ...profile, conversationThreadId: input.threadId },
              };
              yield* Deferred.succeed(recovered, undefined);
              return owner;
            }),
        }),
        Layer.mock(Threads.ThreadManagementService)({
          getThreadRecords: () =>
            deleted
              ? Effect.die("Recovery tried to read a deleted conversation")
              : Effect.succeed(projection),
          dispatch: (command) =>
            Effect.sync(() => {
              if (dispatched.has(command.commandId)) return { events: [], effectIds: [] } as never;
              dispatched.add(command.commandId);
              if (command.type === "thread.create") {
                assert.equal(command.threadId, threadId);
                assert.deepEqual(command.modelSelection, owner.defaultModelSelection);
                assert.notProperty(command, "contextHandoffId");
                creations++;
              } else if (command.type === "thread.delete") {
                assert.equal(command.threadId, previousThreadId);
                deleted = true;
              } else assert.fail("Unexpected reset command");
              return { events: [], effectIds: [] } as never;
            }),
        }),
        Layer.mock(Sessions.ProviderSessionManagerV2)({
          detach: (input) =>
            Effect.gen(function* () {
              assert.equal(input.providerSessionId, ProviderSessionId.make("old-session"));
              assert.isTrue(input.revokeMcpCredential);
              assert.isTrue(deleted);
              if (scenario === "failed-detach" && failNext) {
                failNext = false;
                return yield* new Sessions.ProviderSessionCloseError({
                  providerSessionId: input.providerSessionId,
                });
              }
              assert.include(
                yield* fs.readFileString(path.join(memory, "MEMORY.md")).pipe(Effect.orDie),
                "previous conversation",
              );
              detached = true;
            }),
        }),
      );
      const input: AgentResetInput = {
        commandId: CommandId.make("reset"),
        projectId,
        previousThreadId,
        threadId,
      };
      if (scenario === "failed-detach" || scenario === "failed-link") {
        const sql = yield* SqlClient.SqlClient;
        yield* Effect.flatMap(PersistentAgents.PersistentAgents, (agents) =>
          agents.reset(input).pipe(Effect.flip),
        ).pipe(Effect.provide(PersistentAgents.layer.pipe(Layer.provide(dependencies))));
        assert.equal(owner.agentProfile?.conversationThreadId, previousThreadId);
        assert.lengthOf(yield* sql`SELECT * FROM persistent_agent_resets`, 1);
        if (scenario === "failed-link")
          yield* fs.writeFileString(path.join(memory, "MEMORY.md"), "Fresh memory");
        // Rebuilding the service starts its scheduler source; no UI retry is needed.
        yield* Effect.gen(function* () {
          const agents = yield* PersistentAgents.PersistentAgents;
          yield* Deferred.await(recovered);
          assert.equal(owner.agentProfile?.conversationThreadId, threadId);
          assert.deepEqual(yield* agents.reset(input), { projectId, threadId });
        }).pipe(Effect.provide(PersistentAgents.layer.pipe(Layer.provide(dependencies))));
        assert.equal(creations, 1);
        assert.deepEqual(yield* sql`SELECT * FROM persistent_agent_resets`, []);
        if (scenario === "failed-link")
          assert.equal(yield* fs.readFileString(path.join(memory, "MEMORY.md")), "Fresh memory");
        return;
      }
      yield* Effect.gen(function* () {
        const agents = yield* PersistentAgents.PersistentAgents;
        if (scenario === "linked-memory") {
          const error = yield* agents.reset(input).pipe(Effect.flip);
          assert.include(error.message, "within its workspace");
          assert.equal(creations, 0);
          assert.isFalse(deleted);
          assert.equal(
            yield* fs.readFileString(path.join(memory, "MEMORY.md")),
            "Other agent memory",
          );
          return;
        }
        assert.deepEqual(yield* agents.reset(input), { projectId, threadId });
        assert.deepEqual(owner.agentProfile, { ...profile, conversationThreadId: threadId });
        assert.equal(yield* fs.readFileString(sibling), "Keep workspace files");
        yield* fs.writeFileString(path.join(memory, "MEMORY.md"), "New memory");
        yield* agents.reset(input);
        assert.equal(creations, 1);
        assert.equal(yield* fs.readFileString(path.join(memory, "MEMORY.md")), "New memory");
        const stale = yield* agents
          .reset({ ...input, threadId: ThreadId.make("another") })
          .pipe(Effect.flip);
        assert.include(stale.message, "conversation changed");
      }).pipe(Effect.provide(PersistentAgents.layer.pipe(Layer.provide(dependencies))));
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          SqlitePersistenceMemory.pipe(Layer.provide(NodeServices.layer)),
          NodeServices.layer,
        ),
      ),
    ),
  );
}

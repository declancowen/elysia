import * as RepositoryInitialization from "../../../project/RepositoryInitialization.ts";
import * as DateTime from "effect/DateTime";
import { ClaudeProviderCapabilitiesV2 } from "../../../orchestration-v2/Adapters/ClaudeAdapterV2.ts";
import * as ProjectionStore from "../../../orchestration-v2/ProjectionStore.ts";
import * as ProjectStore from "../../../orchestration-v2/ProjectStore.ts";
import {
  EnvironmentId,
  GitManagerError,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  VcsProcessExitError,
  type OrchestrationProjectShell,
  type OrchestrationV2AppThread,
  type OrchestrationV2ProviderSession,
  ProviderSessionId,
  ProviderDriverKind,
  EventId,
  type VcsInitInput,
  type VcsStatusResult,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import { McpSchema, McpServer } from "effect/ai";
import { ServerConfig } from "../../../config.ts";
import { layerTest as configLayerTest } from "../../../config.ts";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { VcsProvisioningService } from "../../../vcs/VcsProvisioningService.ts";
import { VcsStatusBroadcaster } from "../../../vcs/VcsStatusBroadcaster.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { layerRepositoryToolkit } from "../../McpHttpServer.ts";
import { HandlersLayer } from "../../McpToolAccess.ts";
import * as ThreadManagement from "../../../orchestration-v2/ThreadManagementService.ts";
import { liveThreadShell } from "../../McpToolAccess.testkit.ts";
import { layer as layerRepositoryHandlers } from "./handlers.ts";
import { RepositoryToolkit } from "./tools.ts";

const projectId = ProjectId.make("repository-project");
const threadId = ThreadId.make("repository-thread");
const instanceId = ProviderInstanceId.make("claude-code");
const invocation: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("repository-environment"),
  requestNamespace: "repository-provider-session",
  thread: {
    threadId,
    providerSessionId: "repository-provider-session",
    providerInstanceId: instanceId,
  },
  client: undefined,
  capabilities: new Set(["repository"]),
  issuedAt: 1,
};
const project: OrchestrationProjectShell = {
  id: projectId,
  title: "Project",
  workspaceRoot: "/workspace/project",
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-10-02T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
};
const timestamp = DateTime.makeUnsafe(project.createdAt);
const thread: OrchestrationV2AppThread & { session: OrchestrationV2ProviderSession | null } = {
  id: threadId,
  projectId,
  title: "Chat",
  providerInstanceId: instanceId,
  modelSelection: { instanceId, model: "kimi-k3" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  pullRequests: [],
  activeProviderThreadId: null,
  lineage: { rootThreadId: threadId, parentThreadId: null, relationshipToParent: null },
  forkedFrom: null,
  createdBy: "user",
  creationSource: "web",
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  lastVisitedAt: null,
  deletedAt: null,
  session: {
    id: ProviderSessionId.make(invocation.thread!.providerSessionId),
    driver: ProviderDriverKind.make("claudeAgent"),
    providerInstanceId: instanceId,
    status: "running",
    cwd: project.workspaceRoot,
    model: "kimi-k3",
    capabilities: ClaudeProviderCapabilitiesV2,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastError: null,
  },
};
const gitStatus: VcsStatusResult = {
  isRepo: true,
  hasPrimaryRemote: false,
  isDefaultRef: true,
  refName: "main",
  hasWorkingTreeChanges: false,
  workingTree: { files: [], insertions: 0, deletions: 0 },
  hasUpstream: false,
  aheadCount: 0,
  behindCount: 0,
  pr: null,
};

const makeHarness = Effect.fn("makeRepositoryToolkitHarness")(function* (
  options: {
    thread?: (OrchestrationV2AppThread & { session: OrchestrationV2ProviderSession | null }) | null;
    project?: OrchestrationProjectShell | null;
    failInit?: boolean;
    failRefresh?: boolean;
  } = {},
) {
  const currentThread = yield* Ref.make(options.thread === undefined ? thread : options.thread);
  const currentProject = yield* Ref.make(options.project === undefined ? project : options.project);
  const calls = yield* Ref.make<ReadonlyArray<VcsInitInput>>([]);
  const refreshed = yield* Deferred.make<string>();
  const config = yield* ServerConfig.pipe(
    Effect.provide(
      configLayerTest(process.cwd(), { prefix: "elysia-repository-toolkit-" }).pipe(
        Layer.provide(NodeServices.layer),
      ),
    ),
  );
  const dependencies = Layer.mergeAll(
    Layer.succeed(ServerConfig, { ...config, baseDir: "/state" }),
    NodeServices.layer,
    Layer.mock(ThreadManagement.ThreadManagementService)({
      getThreadShell: (id) =>
        Ref.get(currentThread).pipe(
          Effect.map((value) =>
            value !== null && id === threadId ? { ...liveThreadShell(id), ...value } : null,
          ),
        ),
    }),
    Layer.mock(ProjectionStore.ProjectionStoreV2)({
      getThreadRecords: (id) =>
        Ref.get(currentThread).pipe(
          Effect.flatMap((value) =>
            value !== null && id === threadId
              ? Effect.succeed({
                  ...ProjectionStore.emptyProjection({
                    id: EventId.make("repository-thread-created"),
                    type: "thread.created",
                    threadId,
                    occurredAt: timestamp,
                    payload: value,
                  }),
                  providerSessions: value.session ? [value.session] : [],
                })
              : Effect.fail(
                  new ProjectionStore.ProjectionStoreThreadNotFoundError({ threadId: id }),
                ),
          ),
        ),
    }),
    Layer.mock(ProjectStore.ProjectStoreV2)({
      get: (id) =>
        Ref.get(currentProject).pipe(
          Effect.map((value) =>
            id === projectId && value !== null
              ? Option.some({
                  ...value,
                  projectId: value.id,
                  defaultThreadEnvMode: null,
                  autoPull: false,
                  faviconPath: null,
                  projectIcon: null,
                  deletedAt: null,
                })
              : Option.none(),
          ),
        ),
    }),
    Layer.mock(VcsProvisioningService)({
      initRepository: (input) =>
        Ref.update(calls, (recorded) => [...recorded, input]).pipe(
          Effect.andThen(
            options.failInit
              ? Effect.fail(
                  new VcsProcessExitError({
                    operation: "GitVcsDriver.initRepository",
                    command: "git init",
                    cwd: input.cwd,
                    exitCode: 1,
                    detail: "Permission denied",
                  }),
                )
              : Effect.void,
          ),
        ),
    }),
    Layer.mock(VcsStatusBroadcaster)({
      refreshStatus: (cwd) =>
        Deferred.succeed(refreshed, cwd).pipe(
          Effect.andThen(
            options.failRefresh
              ? Effect.fail(
                  new GitManagerError({
                    operation: "refreshStatus",
                    cwd,
                    detail: "Status unavailable",
                  }),
                )
              : Effect.succeed(gitStatus),
          ),
        ),
    }),
  );
  const toolkit = yield* RepositoryToolkit.pipe(
    Effect.provide(
      HandlersLayer.layer(layerRepositoryHandlers).pipe(
        Layer.provide(RepositoryInitialization.layer),
        Layer.provide(dependencies),
      ),
    ),
  );
  const call = (scope = invocation) =>
    toolkit.handle("initialize_git", {}).pipe(
      Stream.unwrap,
      Stream.runCollect,
      Effect.map((results) => results.at(-1)!.result),
      Effect.provideService(McpInvocationContext.McpInvocationContext, scope),
      Effect.provide(RepositoryInitialization.layer.pipe(Layer.provideMerge(dependencies))),
    );
  const initialize = (input = invocation) =>
    Effect.flatMap(RepositoryInitialization.RepositoryInitialization, (service) =>
      service.initialize(input.thread!),
    ).pipe(Effect.provide(RepositoryInitialization.layer.pipe(Layer.provide(dependencies))));
  return { calls, refreshed, currentThread, currentProject, dependencies, call, initialize };
});

describe("repository toolkit", () => {
  it.effect("domain service denies a stale provider-session identity before touching Git", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      expect(
        yield* harness
          .initialize({
            ...invocation,
            thread: { ...invocation.thread!, providerSessionId: "different-session" },
          })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "RepositoryInitializationDeniedError" });
      expect(yield* Ref.get(harness.calls)).toEqual([]);
    }),
  );
  it.effect("initializes only the credential's project workspace and refreshes its status", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      expect(yield* harness.call()).toEqual({ cwd: project.workspaceRoot });
      expect(yield* Ref.get(harness.calls)).toEqual([{ cwd: project.workspaceRoot, kind: "git" }]);
      expect(yield* Deferred.await(harness.refreshed)).toBe(project.workspaceRoot);
    }),
  );

  it.effect("uses the chat's linked worktree rather than the project root", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness({
        thread: { ...thread, worktreePath: "/worktrees/elysia-feature" },
      });
      expect(yield* harness.call()).toEqual({ cwd: "/worktrees/elysia-feature" });
      expect(yield* Deferred.await(harness.refreshed)).toBe("/worktrees/elysia-feature");
    }),
  );

  it.effect(
    "rejects active and archived persistent agent workspaces without initializing Git",
    () =>
      Effect.gen(function* () {
        const workspaceRoot = "/state/agents/agent-1";
        const harness = yield* makeHarness({
          project: {
            ...project,
            workspaceRoot,
            agentProfile: {
              instructions: "Help with work.",
              avatar: { preset: "circle", color: "#28B4FF" },
              notificationsEnabled: true,
              archived: false,
              conversationThreadId: threadId,
            },
          },
        });
        expect(yield* harness.call().pipe(Effect.flip)).toMatchObject({
          _tag: "RepositoryInitializationDeniedError",
        });
        yield* Ref.update(harness.currentProject, (value) =>
          value?.agentProfile
            ? { ...value, agentProfile: { ...value.agentProfile, archived: true } }
            : value,
        );
        expect(yield* harness.call().pipe(Effect.flip)).toMatchObject({
          _tag: "RepositoryInitializationDeniedError",
        });
        expect(yield* Ref.get(harness.calls)).toEqual([]);
        expect(yield* Deferred.isDone(harness.refreshed)).toBe(false);
      }),
  );

  it.effect.each(["/state/scratch", "/state/scratch/", "/state/other/../scratch"])(
    "rejects canonical Scratch workspace %s even when the chat has its own folder",
    (workspaceRoot) =>
      Effect.gen(function* () {
        const harness = yield* makeHarness({
          project: { ...project, workspaceRoot },
          thread: { ...thread, worktreePath: "/state/scratch/my-chat" },
        });
        expect(yield* harness.call().pipe(Effect.flip)).toMatchObject({
          _tag: "RepositoryInitializationDeniedError",
        });
        expect(yield* Ref.get(harness.calls)).toEqual([]);
        expect(yield* Deferred.isDone(harness.refreshed)).toBe(false);
      }),
  );

  it.effect("rejects read-only capability scopes and another thread's token", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      expect(
        yield* harness
          .call({ ...invocation, capabilities: new Set(["preview"]) })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "McpCapabilityUnavailableError", capability: "repository" });
      expect(
        yield* harness
          .call({
            ...invocation,
            thread: { ...invocation.thread!, threadId: ThreadId.make("other-thread") },
          })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "OrchestratorMcpFailure", code: "thread_not_found" });
      expect(yield* Ref.get(harness.calls)).toEqual([]);
    }),
  );

  it.effect.each([
    { thread: null },
    { project: null },
    { thread: { ...thread, archivedAt: timestamp } },
    { thread: { ...thread, deletedAt: timestamp } },
    { thread: { ...thread, interactionMode: "plan" as const } },
    { thread: { ...thread, session: null } },
    ...(["stopped", "error"] as const).map((status) => ({
      thread: { ...thread, session: { ...thread.session!, status } },
    })),
    {
      thread: {
        ...thread,
        session: {
          ...thread.session!,
          providerInstanceId: ProviderInstanceId.make("old-instance"),
        },
      },
    },
  ])("rejects missing, archived, planning or stale session targets %#", (target) =>
    Effect.gen(function* () {
      const harness = yield* makeHarness(target);
      const caller = target.thread;
      expect(yield* harness.call().pipe(Effect.flip)).toMatchObject(
        caller === null || (caller?.deletedAt !== null && caller?.deletedAt !== undefined)
          ? { _tag: "OrchestratorMcpFailure", code: "thread_not_found" }
          : caller?.archivedAt !== null && caller?.archivedAt !== undefined
            ? { _tag: "OrchestratorMcpFailure", code: "parent_not_active" }
            : { _tag: "RepositoryInitializationDeniedError" },
      );
      expect(yield* Ref.get(harness.calls)).toEqual([]);
      expect(yield* Deferred.isDone(harness.refreshed)).toBe(false);
    }),
  );

  it.effect("returns a host Git failure without refreshing or reporting success", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness({ failInit: true });
      expect(yield* harness.call().pipe(Effect.flip)).toMatchObject({
        _tag: "RepositoryInitializationFailedError",
        cause: { _tag: "VcsProcessExitError", exitCode: 1 },
      });
      expect(yield* Deferred.isDone(harness.refreshed)).toBe(false);
    }),
  );

  it.effect("does not turn a completed Git init into a failure when status refresh fails", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness({ failRefresh: true });
      expect(yield* harness.call()).toEqual({ cwd: project.workspaceRoot });
      expect(yield* Deferred.await(harness.refreshed)).toBe(project.workspaceRoot);
    }),
  );

  it.effect(
    "registers the mutation over MCP and never accepts a caller-selected path or flags",
    () =>
      Effect.gen(function* () {
        const harness = yield* makeHarness();
        yield* Effect.gen(function* () {
          const server = yield* McpServer.McpServer;
          const entry = server.tools.find(({ tool }) => tool.name === "initialize_git");
          expect(entry?.tool.annotations).toMatchObject({
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          });
          expect(entry?.tool.inputSchema).toMatchObject({
            type: "object",
            additionalProperties: false,
          });
          const call = (arguments_: Record<string, unknown>) =>
            server.callTool({ name: "initialize_git", arguments: arguments_ }).pipe(
              Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
              Effect.provideService(
                McpSchema.McpServerClient,
                McpSchema.McpServerClient.of({
                  clientId: 1,
                  clientCapabilities: {},
                  clientInfo: { name: "repository-test", version: "1" },
                  protocolVersion: "2025-06-18",
                  initializePayload: {
                    protocolVersion: "2025-06-18",
                    capabilities: {},
                    clientInfo: { name: "repository-test", version: "1" },
                  },
                  getClient: Effect.die("unused"),
                }),
              ),
            );
          const rejected = yield* call({
            cwd: "/private/other-project",
            flags: ["--bare"],
          }).pipe(Effect.flip);
          expect(rejected).toMatchObject({ _tag: "InvalidParams" });
          expect(yield* Ref.get(harness.calls)).toEqual([]);
          const result = yield* call({});
          expect(result.isError).toBeFalsy();
        }).pipe(
          Effect.provide(
            layerRepositoryToolkit.pipe(
              Layer.provide(RepositoryInitialization.layer),
              Layer.provideMerge(McpServer.McpServer.layer),
              Layer.provide(harness.dependencies),
            ),
          ),
        );
        expect(yield* Ref.get(harness.calls)).toEqual([
          { cwd: project.workspaceRoot, kind: "git" },
        ]);
        expect(yield* Deferred.await(harness.refreshed)).toBe(project.workspaceRoot);
      }),
  );
});

import {
  ClaudeSettings,
  CommandId,
  EnvironmentId,
  ProviderInstanceId,
  ProviderSessionId,
  ProjectId,
  RunId,
  RunAttemptId,
  NodeId,
  MessageId,
  ThreadId,
} from "@elysiatools/contracts";
import { describe, it } from "@effect/vitest";
import { expect } from "vite-plus/test";
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Layer from "effect/Layer";
import * as DateTime from "effect/DateTime";
import * as Stream from "effect/Stream";
import type { ClaudeAgentSdkQueryOptions } from "./ClaudeAdapterV2.ts";
import * as IdAllocator from "@elysiatools/provider-core/server/IdAllocator";
import * as CommandPolicy from "../CommandPolicy.ts";
import { elysiaModelCatalog } from "../../provider/ElysiaModelCatalog.ts";
import * as McpProviderSessions from "@elysiatools/provider-core/server/McpProviderSessions";
import type { McpProviderSessionConfig } from "@elysiatools/provider-core/server/mcpSession";
import {
  claudeMcpQueryOverrides,
  makeClaudeQueryOptions,
  makeClaudeAdapterV2,
  ClaudeAgentSdkQueryRunner,
} from "./ClaudeAdapterV2.ts";

const decodeClaudeSettings = Schema.decodeSync(ClaudeSettings);
const modelCatalog = elysiaModelCatalog(["gpt-5-4", "deepseek-v4.1-flash"]);

describe("Elysia V2 runtime boundary", () => {
  it.effect(
    "starts each selected model with native routing headers rather than the saved CLI default",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const profile = yield* fileSystem.makeTempDirectoryScoped({ prefix: "elysia-routing-" });
          const instanceId = ProviderInstanceId.make("elysia-routing-test");
          const catalog = elysiaModelCatalog(["gpt-6.1-sol", "deepseek-v4.1-flash"]);
          for (const model of ["gpt-6.1-sol", "deepseek-v4.1-flash"]) {
            const nativeHeaders =
              model === "gpt-6.1-sol"
                ? "x-portkey-config: fixture\nx-portkey-beta: use-responses-api"
                : "x-portkey-config: fixture";
            let openedOptions: ClaudeAgentSdkQueryOptions | undefined;
            const adapter = yield* makeClaudeAdapterV2({
              crypto: yield* Crypto.Crypto,
              instanceId,
              settings: decodeClaudeSettings({ homePath: profile }),
              environment: {
                ELYSIA_PROFILE_ROOT: profile,
                ANTHROPIC_MODEL: "deepseek-v4.1-flash",
                ANTHROPIC_CUSTOM_HEADERS: "stale-default-headers",
              },
              resolveEnvironment: (selected) =>
                Effect.succeed({
                  ELYSIA_PROFILE_ROOT: profile,
                  ANTHROPIC_MODEL: selected,
                  ANTHROPIC_AUTH_TOKEN: "fixture-secret",
                  ANTHROPIC_CUSTOM_HEADERS: nativeHeaders,
                }),
              modelCatalog: Effect.succeed(catalog),
              attachmentsDir: profile,
              fileSystem,
              path,
              idAllocator: yield* IdAllocator.IdAllocatorV2,
              queryRunner: {
                allocateSessionId: Effect.succeed("native-model-routing"),
                open: (input) =>
                  Effect.sync(() => {
                    openedOptions = input.options;
                    return {
                      messages: Stream.never,
                      offer: () => Effect.void,
                      setModel: () => Effect.void,
                      applyFlagSettings: () => Effect.void,
                      setPermissionMode: () => Effect.void,
                      backgroundTasks: () => Effect.succeed(false),
                      stopTask: () => Effect.void,
                      interrupt: Effect.void,
                      close: Effect.void,
                    };
                  }),
                forkSession: () => Effect.die("unused"),
                subagentLaunchToolUseId: () => Effect.succeed(null),
                assertComplete: Effect.void,
              },
            });
            const threadId = ThreadId.make("routing-" + model);
            const modelSelection = { instanceId, model };
            const runtimePolicy = {
              cwd: profile,
              runtimeMode: "full-access",
              interactionMode: "default",
            } as const;
            const runtime = yield* adapter.openSession({
              threadId,
              providerSessionId: ProviderSessionId.make("routing-" + model),
              modelSelection,
              runtimePolicy,
            });
            const providerThread = yield* runtime.ensureThread({
              threadId,
              modelSelection,
              runtimePolicy,
            });
            const now = yield* DateTime.now;
            yield* runtime.startTurn({
              appThread: {
                id: threadId,
                projectId: ProjectId.make("routing-project"),
                title: "Routing fixture",
                createdBy: "user",
                creationSource: "web",
                providerInstanceId: instanceId,
                modelSelection,
                runtimeMode: "full-access",
                interactionMode: "default",
                branch: null,
                worktreePath: null,
                activeProviderThreadId: providerThread.id,
                lineage: {
                  parentThreadId: null,
                  relationshipToParent: null,
                  rootThreadId: threadId,
                },
                forkedFrom: null,
                createdAt: now,
                updatedAt: now,
                archivedAt: null,
                settledOverride: null,
                settledAt: null,
                lastVisitedAt: null,
                deletedAt: null,
              },
              threadId,
              runId: RunId.make("routing-run"),
              runOrdinal: 1,
              providerTurnOrdinal: 1,
              attemptId: RunAttemptId.make("routing-attempt"),
              rootNodeId: NodeId.make("routing-root"),
              providerThread,
              message: {
                messageId: MessageId.make("routing-message"),
                text: "Respond using the selected model.",
                attachments: [],
                createdBy: "user",
                creationSource: "web",
              },
              modelSelection,
              runtimePolicy,
            });
            expect(openedOptions?.model).toBe(model);
            expect(openedOptions?.env).toMatchObject({
              ANTHROPIC_MODEL: model,
              ANTHROPIC_AUTH_TOKEN: "fixture-secret",
              ANTHROPIC_CUSTOM_HEADERS: nativeHeaders,
            });
            expect(openedOptions?.managedSettings?.env).not.toHaveProperty(
              "ANTHROPIC_CUSTOM_HEADERS",
            );
            expect(openedOptions?.managedSettings?.env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
          }
        }).pipe(
          Effect.provide(
            Layer.mergeAll(NodeServices.layer, IdAllocator.layer, McpProviderSessions.layer),
          ),
        ),
      ),
  );

  it.effect(
    "rejects a missing protected native session before opening a query, permitting portable recovery",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const profile = yield* fileSystem.makeTempDirectoryScoped({ prefix: "elysia-resume-" });
          const instanceId = ProviderInstanceId.make("elysia-resume-test");
          const threadId = ThreadId.make("elysia-resume-test");
          const modelSelection = { instanceId, model: "deepseek-v4.1-flash" };
          const runtimePolicy = {
            cwd: profile,
            runtimeMode: "full-access",
            interactionMode: "default",
          } as const;
          const adapter = yield* makeClaudeAdapterV2({
            crypto: yield* Crypto.Crypto,
            instanceId,
            settings: decodeClaudeSettings({ homePath: profile }),
            environment: { ELYSIA_PROFILE_ROOT: profile },
            attachmentsDir: profile,
            fileSystem,
            path,
            idAllocator: yield* IdAllocator.IdAllocatorV2,
            queryRunner: yield* ClaudeAgentSdkQueryRunner,
          });
          for (const persistentAgent of [false, true]) {
            const transition = yield* adapter.planSelectionTransition({
              current: modelSelection,
              target: { ...modelSelection, model: "gpt-5-4" },
              persistentAgent,
              sessionCapabilities: yield* adapter.getCapabilities(),
            });
            expect(transition.type).toBe("create_with_handoff");
            const capabilities = yield* adapter.getCapabilities();
            const native = yield* adapter.planSelectionTransition({
              current: modelSelection,
              target: { ...modelSelection, model: "gpt-5-4" },
              persistentAgent,
              sessionCapabilities: {
                ...capabilities,
                sessions: { ...capabilities.sessions, supportsModelSwitchInSession: true },
              },
            });
            expect(native.type).toBe("apply_on_next_turn");
          }
          const runtime = yield* adapter.openSession({
            threadId,
            providerSessionId: ProviderSessionId.make("elysia-resume-test"),
            modelSelection,
            runtimePolicy,
          });
          const providerThread = yield* runtime.ensureThread({
            threadId,
            modelSelection,
            runtimePolicy,
          });
          const failure = yield* runtime.resumeThread({ providerThread }).pipe(Effect.flip);
          expect(failure._tag).toBe("ProviderAdapterResumeThreadError");
          const project = path.join(profile, "projects", "encoded-project");
          yield* fileSystem.makeDirectory(project, { recursive: true });
          yield* fileSystem.writeFileString(
            path.join(project, "native-resume-fixture.jsonl"),
            "{}\n",
          );
          expect((yield* runtime.resumeThread({ providerThread })).nativeThreadRef).toEqual(
            providerThread.nativeThreadRef,
          );
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              NodeServices.layer,
              IdAllocator.layer,
              McpProviderSessions.layer,
              Layer.mock(ClaudeAgentSdkQueryRunner)({
                allocateSessionId: Effect.succeed("native-resume-fixture"),
                open: () => Effect.die("Resume validation must precede any query or user prompt."),
              }),
            ),
          ),
        ),
      ),
  );
  it.each([false, true])(
    "keeps gateway model, compression, tracing and protected credentials in full access (channel=%s)",
    (channel) => {
      const options = makeClaudeQueryOptions({
        modelSelection: {
          instanceId: ProviderInstanceId.make("claudeAgent"),
          model: "gpt-5-4",
          options: [{ id: "effort", value: "xhigh" }],
        },
        modelCatalog,
        nativeThreadId: "native-thread",
        resume: false,
        cwd: "/tmp/elysia-agent-workspace",
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        settings: decodeClaudeSettings({ binaryPath: "/tmp/native-claude" }),
        environment: {
          ELYSIA_PROFILE_ROOT: "/tmp/elysia-v2-profile",
          ELYSIA_REAL_HOME: "/tmp/elysia-v2-real-home",
          CLAUDE_CONFIG_DIR: "/tmp/elysia-v2-profile/.claude",
          ANTHROPIC_BASE_URL: "http://127.0.0.1:9123",
          ANTHROPIC_AUTH_TOKEN: "fixture-token",
          ANTHROPIC_CUSTOM_HEADERS: "Workspace: fixture",
          TRACE_TO_LANGSMITH: "true",
          CC_LANGSMITH_METADATA: '{"compression":"enabled"}',
        },
        persistentAgent: {
          ...(channel ? { channelThreadId: ThreadId.make("channel-conversation") } : {}),
          name: "Your First Agent",
          instructions: "Help finish work.",
          memoryDirectory: "/tmp/elysia-agent-workspace/.claude/memory",
        },
      });
      expect(options.systemPrompt).toMatchObject({
        append: expect.stringContaining(
          channel ? "independent channel conversation" : "/memory/session-handoff.md",
        ),
      });
      expect(options.model).toBe("gpt-5-4");
      expect(options.effort).toBe("xhigh");
      expect(options.pathToClaudeCodeExecutable).toBe("/tmp/native-claude");
      expect(options.settingSources).toEqual(["user", "project", "local"]);
      expect(options.env).toMatchObject({
        ANTHROPIC_BASE_URL: "http://127.0.0.1:9123",
        TRACE_TO_LANGSMITH: "true",
        ELYSIA_ACTIVE_MODEL: "gpt-5-4",
        DISABLE_AUTO_COMPACT: "0",
        DISABLE_COMPACT: "0",
        ANTHROPIC_CUSTOM_MODEL_OPTION: "gpt-5-4",
        ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES: "effort,xhigh_effort",
      });
      expect(options.managedSettings).toMatchObject({
        autoCompactEnabled: true,
        autoMemoryEnabled: true,
        autoMemoryDirectory: "/tmp/elysia-agent-workspace/.claude/memory",
        availableModels: ["gpt-5-4", "deepseek-v4.1-flash"],
        enforceAvailableModels: true,
        sandbox: {
          enabled: true,
          failIfUnavailable: true,
          allowUnsandboxedCommands: false,
          credentials: {
            envVars: expect.arrayContaining([{ name: "ANTHROPIC_AUTH_TOKEN", mode: "deny" }]),
          },
        },
      });
      expect(options.hooks?.PreToolUse).toHaveLength(1);
      expect(options.systemPrompt).toMatchObject({
        append: expect.stringContaining("Your First Agent"),
      });
    },
  );

  it.each([
    ["gpt-6.1-sol", "272000", "230000"],
    ["claude-haiku-5-5", "1000000", "850000"],
  ])(
    "passes native CLI context limits for %s to both process and managed settings",
    (model, maximum, compact) => {
      const catalog = elysiaModelCatalog(["gpt-6.1-sol", "claude-haiku-5-5"], "claude-haiku-5-5", {
        "gpt-6.1-sol": { contextWindowTokens: 272000, autoCompactWindowTokens: 230000 },
        "claude-haiku-5-5": { contextWindowTokens: 1000000, autoCompactWindowTokens: 850000 },
      });
      const options = makeClaudeQueryOptions({
        modelSelection: { instanceId: ProviderInstanceId.make("elysia"), model },
        nativeThreadId: "native-context-test",
        resume: false,
        cwd: "/tmp/elysia-workspace",
        modelCatalog: catalog,
        environment: {
          ELYSIA_PROFILE_ROOT: "/tmp/elysia-context-profile",
          ANTHROPIC_MODEL: "claude-haiku-5-5",
          ANTHROPIC_AUTH_TOKEN: "fixture-token",
          ANTHROPIC_CUSTOM_HEADERS: "x-portkey-beta:use-responses-api-2026-07-30",
          NODE_EXTRA_CA_CERTS: "/tmp/company-ca.pem",
          CLAUDE_CODE_MAX_CONTEXT_TOKENS: "1000000",
          CLAUDE_CODE_AUTO_COMPACT_WINDOW: "850000",
          CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT: "1",
        },
      });
      expect(options.env).toMatchObject({
        CLAUDE_CODE_MAX_CONTEXT_TOKENS: maximum,
        CLAUDE_CODE_AUTO_COMPACT_WINDOW: compact,
        CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT: "1",
        ANTHROPIC_MODEL: "claude-haiku-5-5",
        ANTHROPIC_AUTH_TOKEN: "fixture-token",
        ANTHROPIC_CUSTOM_HEADERS: "x-portkey-beta:use-responses-api-2026-07-30",
        NODE_EXTRA_CA_CERTS: "/tmp/company-ca.pem",
      });
      expect(options.managedSettings?.env).toMatchObject({
        CLAUDE_CODE_MAX_CONTEXT_TOKENS: maximum,
        CLAUDE_CODE_AUTO_COMPACT_WINDOW: compact,
        CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT: "1",
      });
      expect(options.model).toBe(model);
    },
  );

  it("does not invent context limits or an enforcement preference for legacy CLI profiles", () => {
    const options = makeClaudeQueryOptions({
      modelSelection: { instanceId: ProviderInstanceId.make("elysia"), model: "gpt-5-4" },
      nativeThreadId: "legacy-context-test",
      resume: false,
      cwd: "/tmp/elysia-workspace",
      modelCatalog,
      environment: { ELYSIA_PROFILE_ROOT: "/tmp/elysia-legacy-profile" },
    });
    for (const name of [
      "CLAUDE_CODE_MAX_CONTEXT_TOKENS",
      "CLAUDE_CODE_AUTO_COMPACT_WINDOW",
      "CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT",
    ]) {
      expect(options.env?.[name]).toBeUndefined();
      expect(options.managedSettings?.env?.[name]).toBeUndefined();
    }
  });

  it("uses the Elysia MCP name with matching read-only tool permissions", () => {
    const threadId = ThreadId.make("elysia-v2-mcp");
    const mcpSession: McpProviderSessionConfig = {
      threadId,
      environmentId: EnvironmentId.make("00000000-0000-4000-8000-000000000001"),
      providerSessionId: "elysia-test-session",
      providerInstanceId: ProviderInstanceId.make("elysia-test"),
      browserToolsAvailable: false,
      endpoint: "http://127.0.0.1/mcp",
      authorizationHeader: "Bearer fixture",
    };
    {
      const options = claudeMcpQueryOverrides({
        mcpSession,
        readOnlySandbox: true,
        serverName: "elysia",
      });
      expect(options.mcpServers).toHaveProperty("elysia");
      expect(options.allowedTools?.every((tool) => tool.startsWith("mcp__elysia__"))).toBe(true);
      expect(options.allowedTools).not.toContain("mcp__elysia__*");
      expect(options.allowedTools).toContain("mcp__elysia__list_scheduled_tasks");
      for (const serverName of ["elysia", "elysia"]) {
        const fullAccess = claudeMcpQueryOverrides({
          mcpSession,
          readOnlySandbox: false,
          serverName,
        });
        expect(fullAccess.mcpServers).toHaveProperty(serverName);
        expect(fullAccess.allowedTools).toContain(`mcp__${serverName}__*`);
      }
    }
  });
  it.effect("forks through V2 portable context instead of the ambient Claude profile", () =>
    Effect.gen(function* () {
      const instanceId = ProviderInstanceId.make("claudeAgent");
      const adapter = yield* makeClaudeAdapterV2({
        crypto: yield* Crypto.Crypto,
        instanceId,
        settings: decodeClaudeSettings({}),
        environment: { ELYSIA_PROFILE_ROOT: "/tmp/elysia-v2-profile" },
        attachmentsDir: "/tmp/attachments",
        fileSystem: yield* FileSystem.FileSystem,
        path: yield* Path.Path,
        idAllocator: yield* IdAllocator.IdAllocatorV2,
        queryRunner: yield* ClaudeAgentSdkQueryRunner,
      });
      const capabilities = yield* adapter.getCapabilities();
      expect(capabilities.sessions.supportsModelSwitchInSession).toBe(false);
      const policy = yield* CommandPolicy.CommandPolicyV2;
      expect(
        yield* policy.decideForkExecution({
          commandId: CommandId.make("fork-fixture"),
          threadId: ThreadId.make("source"),
          providerInstanceId: instanceId,
          capabilities,
          sameProvider: true,
          hasStrongNativeSource: true,
          sourceRunStatus: "completed",
          fromSpecificTurn: true,
        }),
      ).toBe("portable_context");
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          NodeServices.layer,
          IdAllocator.layer,
          McpProviderSessions.layer,
          CommandPolicy.layer,
          Layer.mock(ClaudeAgentSdkQueryRunner)({}),
        ),
      ),
    ),
  );
});

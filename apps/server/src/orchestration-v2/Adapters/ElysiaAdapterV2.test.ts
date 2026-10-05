import {
  ClaudeSettings,
  CommandId,
  EnvironmentId,
  ProviderInstanceId,
  ProviderSessionId,
  ThreadId,
} from "@t3tools/contracts";
import { describe, it } from "@effect/vitest";
import { expect } from "vite-plus/test";
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Layer from "effect/Layer";
import * as IdAllocator from "../IdAllocator.ts";
import * as CommandPolicy from "../CommandPolicy.ts";
import { elysiaModelCatalog } from "../../provider/ElysiaModelCatalog.ts";
import * as McpProviderSession from "../../mcp/McpProviderSession.ts";
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
          const adapter = makeClaudeAdapterV2({
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

  it("uses the Elysia MCP name with matching read-only tool permissions", () => {
    const threadId = ThreadId.make("elysia-v2-mcp");
    McpProviderSession.setMcpProviderSession({
      threadId,
      environmentId: EnvironmentId.make("00000000-0000-4000-8000-000000000001"),
      providerSessionId: "elysia-test-session",
      providerInstanceId: ProviderInstanceId.make("elysia-test"),
      browserToolsAvailable: false,
      endpoint: "http://127.0.0.1/mcp",
      authorizationHeader: "Bearer fixture",
    });
    try {
      const options = claudeMcpQueryOverrides({
        threadId,
        readOnlySandbox: true,
        serverName: "elysia",
      });
      expect(options.mcpServers).toHaveProperty("elysia");
      expect(options.allowedTools?.every((tool) => tool.startsWith("mcp__elysia__"))).toBe(true);
      expect(options.allowedTools).not.toContain("mcp__elysia__*");
      expect(options.allowedTools).toContain("mcp__elysia__list_scheduled_tasks");
      for (const serverName of ["elysia", "t3-code"]) {
        const fullAccess = claudeMcpQueryOverrides({
          threadId,
          readOnlySandbox: false,
          serverName,
        });
        expect(fullAccess.mcpServers).toHaveProperty(serverName);
        expect(fullAccess.allowedTools).toContain(`mcp__${serverName}__*`);
      }
    } finally {
      McpProviderSession.clearMcpProviderSession(threadId);
    }
  });
  it.effect("forks through V2 portable context instead of the ambient Claude profile", () =>
    Effect.gen(function* () {
      const instanceId = ProviderInstanceId.make("claudeAgent");
      const adapter = makeClaudeAdapterV2({
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
          CommandPolicy.layer,
          Layer.mock(ClaudeAgentSdkQueryRunner)({}),
        ),
      ),
    ),
  );
});

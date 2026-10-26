import { ProviderInstanceId, ThreadId, type ServerProvider } from "@elysiatools/contracts";
import { expect, it } from "@effect/vitest";

import { type AgentThread, agentToolProperties, handoffSettings } from "./ProviderDimensions.ts";

const provider = (
  instanceId: string,
  driver: string,
  models: ReadonlyArray<{ slug: string; isCustom: boolean }>,
) =>
  ({
    instanceId: ProviderInstanceId.make(instanceId),
    driver,
    models,
  }) as unknown as ServerProvider;

const providers = [
  provider("work-codex", "codex", [{ slug: "gpt-5.5", isCustom: false }]),
  provider("claudeAgent", "claudeAgent", [
    { slug: "claude-opus-5-5", isCustom: false },
    { slug: "my-private-finetune", isCustom: true },
  ]),
  provider("opencode", "opencode", [{ slug: "ollama/acme-internal", isCustom: false }]),
];

const thread = (
  instanceId: string,
  model: string,
  overrides: Partial<AgentThread> = {},
): AgentThread => ({
  modelSelection: { instanceId: ProviderInstanceId.make(instanceId), model },
  runtimeMode: "full-access",
  interactionMode: "default",
  createdBy: "user",
  creationSource: "web",
  lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: ThreadId.make("t") },
  ...overrides,
});

it("omits custom, user-configured, and unknown models and instance names", () => {
  expect(
    agentToolProperties({
      tool: "elysia_thread_send",
      providers,
      caller: thread("claudeAgent", "my-private-finetune"),
      targets: [thread("opencode", "ollama/acme-internal"), thread("removed-instance", "gpt-5.5")],
      outcome: { outcome: "ok" },
    }).map(({ callerProvider, callerModel, targetProvider, targetModel }) => ({
      callerProvider,
      callerModel,
      targetProvider,
      targetModel,
    })),
  ).toEqual([
    {
      callerProvider: "claudeAgent",
      callerModel: undefined,
      targetProvider: "opencode",
      targetModel: undefined,
    },
    {
      callerProvider: "claudeAgent",
      callerModel: undefined,
      targetProvider: "unknown",
      targetModel: undefined,
    },
  ]);
});

it("reads handoff settings from enums and flags, never from prompts or ids", () => {
  expect(
    handoffSettings(
      "delegate_task",
      { task: "secret", mode: "wait", target: { driverKind: "claudeAgent" } },
      { taskId: "t", waitTimedOut: true },
    ),
  ).toEqual({ targetChosen: true, mode: "wait", waitTimedOut: true });
  expect(handoffSettings("delegate_task", { task: "secret" }, { waitTimedOut: false })).toEqual({
    targetChosen: false,
    mode: "async",
  });
  expect(
    handoffSettings(
      "elysia_thread_launch",
      { message: "secret", workspaceStrategy: { type: "worktree", branch: "private" } },
      {},
    ),
  ).toEqual({ targetChosen: false, workspace: "worktree" });
  expect(handoffSettings("elysia_thread_launch", { scratch: true }, {})).toMatchObject({
    workspace: "scratch",
  });
  expect(
    handoffSettings(
      "create_threads",
      { threads: [{ prompt: "a" }, { prompt: "b", target: {} }] },
      {},
    ),
  ).toEqual({ batchSize: 2, targetChosen: true });
  expect(
    handoffSettings("elysia_thread_send", { message: "secret" }, { delivery: "steered" }),
  ).toEqual({ delivery: "steered" });
  expect(handoffSettings("elysia_thread_send_attachments", { message: "secret" }, {})).toEqual({
    delivery: "auto",
  });
});

it("drops input strings outside the schema's literals, since rejected calls are recorded too", () => {
  expect(handoffSettings("delegate_task", { mode: "/home/me/secret" }, undefined)).toEqual({
    targetChosen: false,
    mode: "async",
  });
  expect(
    handoffSettings("elysia_thread_launch", { workspaceStrategy: { type: "/home/me/secret" } }, {}),
  ).toEqual({ targetChosen: false, workspace: "root" });
});

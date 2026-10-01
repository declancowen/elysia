// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import { elysiaAgentProtection } from "./ElysiaAgentProtection.ts";

it("permits native agent memory and workspace tools while denying credential and shared memory paths", async () => {
  const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "elysia-agent-protection-"));
  try {
    const state = NodePath.join(home, "userdata");
    const profile = NodePath.join(state, "providers", "elysia");
    const workspace = NodePath.join(state, "agents", "agent-1");
    const memory = NodePath.join(workspace, ".claude", "memory", "MEMORY.md");
    const nativeClaude = NodePath.join(home, ".claude");
    for (const directory of [
      profile,
      NodePath.dirname(memory),
      NodePath.join(nativeClaude, "projects"),
      NodePath.join(state, "secrets"),
    ])
      NodeFS.mkdirSync(directory, { recursive: true });
    const policy = elysiaAgentProtection({
      ELYSIA_PROFILE_ROOT: profile,
      ELYSIA_STATE_DIR: state,
      ELYSIA_REAL_HOME: home,
      ANTHROPIC_AUTH_TOKEN: "fixture-secret",
      CC_LANGSMITH_API_KEY: "trace-secret",
      TRACE_TO_LANGSMITH: "true",
    });
    const hook = policy.hooks!.PreToolUse![0]!.hooks[0]!;
    const call = (tool_name: string, file_path: string) =>
      hook(
        {
          hook_event_name: "PreToolUse",
          session_id: "fixture",
          transcript_path: "fixture",
          cwd: workspace,
          tool_name,
          tool_input: { file_path },
          tool_use_id: "fixture",
        },
        undefined,
        { signal: new AbortController().signal },
      );
    for (const tool of ["Read", "Write", "Edit"]) {
      expect(await call(tool, memory)).toEqual({});
      expect(await call(tool, NodePath.join(workspace, "report.md"))).toEqual({});
      expect(await call(tool, NodePath.join(state, "secrets", "api-key.json"))).toMatchObject({
        hookSpecificOutput: { permissionDecision: "deny" },
      });
      expect(
        await call(tool, NodePath.join(nativeClaude, "projects", "shared", "memory", "MEMORY.md")),
      ).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
    }
    const denyRead = policy.sandbox!.filesystem!.denyRead!;
    const denyWrite = policy.sandbox!.filesystem!.denyWrite!;
    for (const denied of [...denyRead, ...denyWrite])
      expect(memory === denied || memory.startsWith(denied + NodePath.sep)).toBe(false);
    expect(policy.sandbox?.credentials?.envVars).toContainEqual({
      name: "ANTHROPIC_AUTH_TOKEN",
      mode: "deny",
    });
    expect(policy.sandbox?.credentials?.envVars).toContainEqual({
      name: "CC_LANGSMITH_API_KEY",
      mode: "deny",
    });
  } finally {
    NodeFS.rmSync(home, { recursive: true, force: true });
  }
});

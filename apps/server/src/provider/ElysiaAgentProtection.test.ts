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

it.each(["default", "custom"])(
  "allows composer files and agent memory in the %s state layout while keeping private state protected",
  async (layout) => {
    const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "elysia-agent-state-"));
    try {
      const state = NodePath.join(home, layout === "default" ? ".elysia/userdata" : "custom-state");
      const profile = NodePath.join(state, "providers", "elysia-claudeAgent");
      const workspace = NodePath.join(state, "agents", "agent-1");
      const files = [
        NodePath.join(state, "attachments", "transcript.txt"),
        NodePath.join(state, "attachments", "assessment.xlsx"),
        NodePath.join(state, "attachments", "assessment.xlsx.txt"),
        NodePath.join(state, "attachments", "slides.pptx"),
        NodePath.join(state, "attachments", "slides.pptx.txt"),
        NodePath.join(workspace, ".claude", "memory", "MEMORY.md"),
      ];
      const privateFiles = [
        NodePath.join(home, ".elysia", "credentials.json"),
        NodePath.join(state, "secrets", "api-key.json"),
        NodePath.join(state, "settings.json"),
        NodePath.join(state, "statev2.sqlite"),
        NodePath.join(profile, ".claude", "settings.json"),
        NodePath.join(state, "providers", "another-profile", "settings.json"),
      ];
      for (const file of [...files, ...privateFiles]) {
        NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
        NodeFS.writeFileSync(file, "fixture");
      }
      const policy = elysiaAgentProtection({
        ELYSIA_PROFILE_ROOT: profile,
        ELYSIA_STATE_DIR: state,
        ELYSIA_REAL_HOME: home,
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
      for (const file of files) {
        expect(await call("Read", file)).toEqual({});
        for (const denied of [
          ...policy.sandbox!.filesystem!.denyRead!,
          ...policy.sandbox!.filesystem!.denyWrite!,
          ...policy.sandbox!.credentials!.files!.map((entry) => entry.path),
        ])
          expect(file === denied || file.startsWith(denied + NodePath.sep)).toBe(false);
      }
      for (const file of privateFiles) {
        for (const tool of ["Read", "Write", "Edit"])
          expect(await call(tool, file)).toMatchObject({
            hookSpecificOutput: { permissionDecision: "deny" },
          });
      }
    } finally {
      NodeFS.rmSync(home, { recursive: true, force: true });
    }
  },
);

it("allows the CLI-selected public CA through canonical paths and symlinks but never permits changing it", async () => {
  const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "elysia-agent-ca-"));
  try {
    const state = NodePath.join(home, ".elysia", "userdata");
    const profile = NodePath.join(state, "providers", "elysia-claudeAgent");
    const certificate = NodePath.join(profile, "trust", "ai-gateway-corporate-ca.pem");
    const secret = NodePath.join(profile, "trust", "private.json");
    const alias = NodePath.join(home, "company-ca.pem");
    NodeFS.mkdirSync(NodePath.dirname(certificate), { recursive: true });
    NodeFS.writeFileSync(certificate, "fixture-public-ca");
    NodeFS.writeFileSync(secret, "fixture-private-config");
    NodeFS.symlinkSync(certificate, alias);
    const policy = elysiaAgentProtection({
      ELYSIA_PROFILE_ROOT: profile,
      ELYSIA_STATE_DIR: state,
      ELYSIA_REAL_HOME: home,
      SSL_CERT_FILE: alias,
      NODE_EXTRA_CA_CERTS: certificate,
    });
    const hook = policy.hooks!.PreToolUse![0]!.hooks[0]!;
    const call = (tool_name: string, file_path: string) =>
      hook(
        {
          hook_event_name: "PreToolUse",
          session_id: "fixture",
          transcript_path: "fixture",
          cwd: home,
          tool_name,
          tool_input: { file_path },
          tool_use_id: "fixture",
        },
        undefined,
        { signal: new AbortController().signal },
      );
    const canonical = NodeFS.realpathSync(certificate);
    expect(policy.sandbox?.filesystem?.allowRead).toEqual([canonical]);
    for (const file of [alias, certificate]) {
      expect(await call("Read", file)).toEqual({});
      for (const tool of ["Write", "Edit"])
        expect(await call(tool, file)).toMatchObject({
          hookSpecificOutput: { permissionDecision: "deny" },
        });
    }
    expect(await call("Read", secret)).toMatchObject({
      hookSpecificOutput: { permissionDecision: "deny" },
    });
    for (const denied of [
      ...policy.sandbox!.filesystem!.denyRead!,
      ...policy.sandbox!.credentials!.files!.map((entry) => entry.path),
    ])
      expect(canonical === denied || canonical.startsWith(denied + NodePath.sep)).toBe(false);
    expect(policy.sandbox?.filesystem?.denyWrite).toContain(canonical);
  } finally {
    NodeFS.rmSync(home, { recursive: true, force: true });
  }
});

it("lets the native CLI validate a new model when persisted model settings are stale", async () => {
  const profile = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "elysia-native-model-"));
  try {
    NodeFS.mkdirSync(NodePath.join(profile, ".claude"));
    NodeFS.writeFileSync(
      NodePath.join(profile, ".claude", "settings.json"),
      JSON.stringify({ allowed_models: ["retired-model"] }),
    );
    // The isolated native command owns validation; this fixture performs no setup or network calls.
    NodeFS.writeFileSync(
      NodePath.join(profile, "elysia-bridge.py"),
      String.raw`
      const fs = require("node:fs");
      const path = require("node:path");
      const [, , , root, operation, model] = process.argv;
      fs.appendFileSync(path.join(root, "calls"), operation + " " + model + "\n");
      if (operation !== "--model" || model !== "gpt-6.1-sol") process.exit(2);
      process.stdout.write("Native model selected.");
    `,
    );
    const selected: string[] = [];
    const policy = elysiaAgentProtection(
      { ELYSIA_PROFILE_ROOT: profile, ELYSIA_PYTHON: process.execPath },
      async (model) => {
        selected.push(model);
      },
    );
    const hook = policy.hooks!.PreToolUse![0]!.hooks[0]!;
    const call = (command: string) =>
      hook(
        {
          hook_event_name: "PreToolUse",
          session_id: "fixture",
          transcript_path: "fixture",
          cwd: profile,
          tool_name: "Bash",
          tool_input: { command },
          tool_use_id: "fixture",
        },
        undefined,
        { signal: new AbortController().signal },
      );
    expect(await call("elysia-code --model gpt-6.1-sol")).toMatchObject({
      hookSpecificOutput: { permissionDecision: "allow" },
    });
    expect(selected).toEqual(["gpt-6.1-sol"]);
    expect(await call("elysia-code --model retired-model")).toMatchObject({
      hookSpecificOutput: { permissionDecision: "deny" },
    });
    expect(selected).toEqual(["gpt-6.1-sol"]);
    expect(NodeFS.readFileSync(NodePath.join(profile, "calls"), "utf8")).toBe(
      "--model gpt-6.1-sol\n--model retired-model\n",
    );
    const calls = NodeFS.readFileSync(NodePath.join(profile, "calls"), "utf8");
    await call("elysia-code --model gpt-6.1-sol; echo compound-command");
    expect(NodeFS.readFileSync(NodePath.join(profile, "calls"), "utf8")).toBe(calls);
  } finally {
    NodeFS.rmSync(profile, { recursive: true, force: true });
  }
});

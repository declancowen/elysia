// @effect-diagnostics nodeBuiltinImport:off - isolated native transcript filesystem fixtures.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import { readElysiaSubagentLaunchToolUseId } from "./ElysiaNativeSessions.ts";

it("recovers native child ownership from the isolated Elysia profile", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "elysia-child-owner-"));
  try {
    const directory = NodePath.join(
      root,
      "projects",
      "encoded-agent-workspace",
      "native-session",
      "subagents",
    );
    await NodeFSP.mkdir(directory, { recursive: true });
    await NodeFSP.writeFile(
      NodePath.join(directory, "agent-child.jsonl"),
      '{"type":"assistant","parent_tool_use_id":"launch-tool"}\n',
    );
    expect(await readElysiaSubagentLaunchToolUseId(root, "native-session", "child")).toBe(
      "launch-tool",
    );
    expect(await readElysiaSubagentLaunchToolUseId(root, "native-session", "missing")).toBeNull();
    expect(await readElysiaSubagentLaunchToolUseId(root, "../native-session", "child")).toBeNull();
    const nested = NodePath.join(directory, "team", "nested");
    await NodeFSP.mkdir(nested, { recursive: true });
    await NodeFSP.writeFile(
      NodePath.join(nested, "agent-teammate.jsonl"),
      '{"type":"assistant","parent_tool_use_id":"nested-launch-tool"}\n',
    );
    expect(await readElysiaSubagentLaunchToolUseId(root, "native-session", "teammate")).toBe(
      "nested-launch-tool",
    );
    const outside = NodePath.join(root, "outside");
    await NodeFSP.mkdir(outside);
    await NodeFSP.writeFile(
      NodePath.join(outside, "agent-outside.jsonl"),
      '{"type":"assistant","parent_tool_use_id":"outside-launch-tool"}\n',
    );
    await NodeFSP.symlink(outside, NodePath.join(directory, "linked-team"));
    expect(await readElysiaSubagentLaunchToolUseId(root, "native-session", "outside")).toBeNull();
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});

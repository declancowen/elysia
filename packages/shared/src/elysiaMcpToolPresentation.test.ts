import { describe, expect, it } from "vite-plus/test";

import {
  ELYSIA_MCP_TOOL_NAMES,
  resolveElysiaMcpToolPresentation,
  resolveElysiaMcpToolId,
} from "./elysiaMcpToolPresentation.ts";

describe("resolveElysiaMcpToolPresentation", () => {
  it("recognizes every Elysia tool across provider prefixes and completion suffixes", () => {
    for (const tool of ELYSIA_MCP_TOOL_NAMES) {
      const presentation = resolveElysiaMcpToolPresentation(tool);
      for (const prefix of [
        "mcp__elysia__",
        "Elysia.",
        "elysia.",
        "elysia/",
        "elysia:",
        "mcp_elysia_",
        "Elysia ",
        "elysia · ",
      ]) {
        expect(resolveElysiaMcpToolPresentation(`${prefix}${tool} completed`), tool).toEqual(
          presentation,
        );
      }
      expect(resolveElysiaMcpToolPresentation(`mcp__another-server__${tool}`), tool).toBeNull();
    }
  });
  it("pretty prints Claude and Cursor Elysia MCP tool names", () => {
    expect(resolveElysiaMcpToolPresentation("mcp__elysia__elysia_thread_read")).toEqual({
      displayName: "Read an Elysia chat",
      logo: "elysia",
    });
  });

  it("pretty prints Codex Elysia MCP tool names", () => {
    expect(resolveElysiaMcpToolPresentation("elysia.create_threads")).toEqual({
      displayName: "Create Elysia chats",
      logo: "elysia",
    });
  });

  it("pretty prints thread metadata updates", () => {
    expect(resolveElysiaMcpToolPresentation("mcp__elysia__elysia_thread_update")).toEqual({
      displayName: "Update Elysia chat metadata",
      logo: "elysia",
    });
  });

  it("pretty prints bare Elysia MCP toolkit names", () => {
    expect(resolveElysiaMcpToolPresentation("list_scheduled_tasks")).toEqual({
      displayName: "List scheduled tasks",
      logo: "elysia",
    });
  });

  it("pretty prints worktree Elysia MCP tool names", () => {
    expect(resolveElysiaMcpToolPresentation("mcp__elysia__elysia_worktree_handoff")).toEqual({
      displayName: "Hand off thread to a git worktree",
      logo: "elysia",
    });
    expect(resolveElysiaMcpToolPresentation("elysia.elysia_worktree_status")).toEqual({
      displayName: "Get thread worktree status",
      logo: "elysia",
    });
  });

  it("pretty prints preview Elysia MCP tool names", () => {
    expect(resolveElysiaMcpToolPresentation("Elysia.preview_open")).toEqual({
      displayName: "Open a page in the preview browser",
      logo: "elysia",
    });
    expect(resolveElysiaMcpToolPresentation("mcp__elysia__preview_status")).toEqual({
      displayName: "Get preview browser status",
      logo: "elysia",
    });
  });

  it("matches the separator variants ACP registry agents emit", () => {
    for (const name of [
      "mcp_elysia_delegate_task",
      "elysia:delegate_task",
      "elysia/delegate_task",
      "elysia delegate_task",
      "Elysia delegate_task",
      "elysia__delegate_task",
    ]) {
      expect(resolveElysiaMcpToolPresentation(name)?.displayName).toBe("Delegate a child task");
    }
  });

  it("matches per-thread server names with underscores without accepting unknown tools", () => {
    for (const tool of ELYSIA_MCP_TOOL_NAMES) {
      const name = `elysia-thread_opencode2-adapter_${tool}`;
      expect(resolveElysiaMcpToolPresentation(name), tool).toEqual(
        resolveElysiaMcpToolPresentation(tool),
      );
      expect(resolveElysiaMcpToolId(name), tool).toBe(tool);
    }
    expect(
      resolveElysiaMcpToolPresentation("elysia-thread_opencode2-adapter_not_a_tool"),
    ).toBeNull();
    expect(resolveElysiaMcpToolId("mcp__another-server__html_render")).toBeNull();
  });

  it("keeps unknown MCP tools on the generic renderer path", () => {
    expect(resolveElysiaMcpToolPresentation("mcp__github__search_issues")).toBeNull();
    expect(resolveElysiaMcpToolPresentation("elysia.not_a_real_tool")).toBeNull();
  });
});

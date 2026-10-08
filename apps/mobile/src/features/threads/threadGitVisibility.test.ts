import { describe, expect, it } from "vite-plus/test";
import { ThreadId } from "@elysiatools/contracts";
import { threadHasProjectGitControls } from "./threadGitVisibility";

describe("project-only mobile Git controls", () => {
  it("keeps ordinary projects and hides Scratch aliases, agents and unresolved projects", () => {
    expect(threadHasProjectGitControls({ workspaceRoot: "/repos/project" }, "/state/scratch")).toBe(
      true,
    );
    expect(threadHasProjectGitControls(null, "/state/scratch")).toBe(false);
    for (const workspaceRoot of ["/state/scratch", "/state/scratch/"]) {
      expect(threadHasProjectGitControls({ workspaceRoot }, "/state/scratch")).toBe(false);
    }
    expect(
      threadHasProjectGitControls(
        {
          workspaceRoot: "/state/agents/id",
          agentProfile: {
            instructions: "Help",
            avatar: { preset: "circle", color: "blue" },
            notificationsEnabled: true,
            archived: false,
            conversationThreadId: ThreadId.make("agent-thread"),
          },
        },
        "/state/scratch",
      ),
    ).toBe(false);
  });
});

// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { useRegularProjects } from "./useRegularProjects";

const state = vi.hoisted(() => ({
  projects: [
    { id: "scratch", environmentId: "local", title: "No project", workspaceRoot: "/home/scratch" },
    { id: "real", environmentId: "local", title: "No project", workspaceRoot: "/home/real" },
    { id: "other", environmentId: "remote", title: "Remote", workspaceRoot: "/home/scratch" },
    { id: "agent", environmentId: "local", workspaceRoot: "/home/agent", agentProfile: {} },
  ],
  environments: [
    { environmentId: "local", serverConfig: { scratchWorkspaceRoot: "/home/scratch" } },
    { environmentId: "remote", serverConfig: { scratchWorkspaceRoot: "/remote/scratch" } },
  ],
}));
vi.mock("../state/entities", () => ({ useProjects: () => state.projects }));
vi.mock("../state/environments", () => ({
  useEnvironments: () => ({ environments: state.environments }),
}));

it("excludes internal scratch and agent workspaces while preserving real projects with the same name or path in another environment", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  let projects: ReturnType<typeof useRegularProjects> = [];
  let chatProjects: ReturnType<typeof useRegularProjects> = [];
  function Harness() {
    const selected = useRegularProjects(false);
    const chats = useRegularProjects();
    useEffect(() => {
      projects = selected;
      chatProjects = chats;
    }, [selected, chats]);
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(projects.map((project) => project.id)).toEqual(["real", "other"]);
    expect(chatProjects.map((project) => project.id)).toEqual(["scratch", "real", "other"]);
  } finally {
    await act(async () => root.unmount());
  }
});

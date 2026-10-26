import { act } from "../../../test/act";
import { RegistryContext } from "@effect/atom-react";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type AgentConversationPreviewsResult,
} from "@elysiatools/contracts";

import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterAll, afterEach, expect, it, vi } from "vite-plus/test";
import type { AgentRosterEntry } from "./useAgents";

const state = vi.hoisted(() => ({
  load: vi.fn<
    (target: {
      environmentId: string;
      input: { projectIds: readonly string[] };
    }) => Promise<AgentConversationPreviewsResult>
  >(),
}));
vi.mock("../../rpc/atomRegistry", async () => {
  const { AtomRegistry } = await import("effect/reactivity");
  return { appAtomRegistry: AtomRegistry.make() };
});
vi.mock("../../state/projects", async () => {
  const { Atom } = await import("effect/reactivity");
  const Effect = await import("effect/Effect");
  const queries = Atom.family((key: string) =>
    Atom.make(Effect.promise(() => state.load(JSON.parse(key)))),
  );
  return {
    projectEnvironment: {
      agentConversationPreviews: (target: unknown) => queries(JSON.stringify(target)),
    },
  };
});

import { appAtomRegistry } from "../../rpc/atomRegistry";
import { useAgentConversationPreviews } from "./useAgentConversationPreviews";

function agent(id: string, environment = "local", archived = false): AgentRosterEntry {
  return {
    project: {
      id: ProjectId.make(id),
      environmentId: EnvironmentId.make(environment),
      title: id,
      workspaceRoot: "/agents",
      repositoryIdentity: null,
      scripts: [],
      defaultModelSelection: null,
      createdAt: "2026-10-20T00:00:00Z",
      updatedAt: "2026-10-20T00:00:00Z",
      agentProfile: {
        instructions: "Help",
        avatar: { preset: "square", color: "#28B4FF" },
        notificationsEnabled: true,
        archived,
        conversationThreadId: ThreadId.make(`${id}-chat`),
      },
    },
    thread: null,
    busy: false,
  };
}
function Watcher({ agents, generation }: { agents: AgentRosterEntry[]; generation: number }) {
  const previews = useAgentConversationPreviews(
    agents.map((entry) => ({ ...entry, project: { ...entry.project } })),
  );
  return (
    <p>
      {generation}:{previews.loading ? "loading" : previews.previews.size}
    </p>
  );
}
let renderer: ReactTestRenderer | null = null;
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = null;
  appAtomRegistry.reset();
  vi.unstubAllGlobals();
  state.load.mockReset();
});
afterAll(() => appAtomRegistry.dispose());

it("bounds reads by environment and keeps equivalent roster renders on the same subscriptions", async () => {
  state.load.mockResolvedValue([]);
  const agents = [
    ...Array.from({ length: 101 }, (_, index) => agent(`agent-${index}`)),
    agent("remote", "remote"),
    agent("archived", "local", true),
  ];
  const render = (generation: number) => (
    <RegistryContext.Provider value={appAtomRegistry}>
      <Watcher agents={agents} generation={generation} />
    </RegistryContext.Provider>
  );
  await act(async () => {
    renderer = create(render(0));
  });
  expect(state.load).toHaveBeenCalledTimes(3);
  expect(
    state.load.mock.calls.map(([target]) => [target.environmentId, target.input.projectIds.length]),
  ).toEqual([
    ["local", 100],
    ["local", 1],
    ["remote", 1],
  ]);
  expect(state.load.mock.calls.flatMap(([target]) => target.input.projectIds)).not.toContain(
    "archived",
  );
  await act(async () => renderer!.update(render(1)));
  expect(renderer!.root.findByType("p").children.join("")).toBe("1:0");
  expect(state.load).toHaveBeenCalledTimes(3);
});

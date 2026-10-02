import { RegistryContext } from "@effect/atom-react";
import { EnvironmentId, EventId, MessageId, ProjectId, ThreadId } from "@t3tools/contracts";
import type { AgentGetDelegationResult } from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({ load: vi.fn<() => Promise<AgentGetDelegationResult>>() }));
vi.mock("../../rpc/atomRegistry", async () => {
  const { AtomRegistry } = await import("effect/unstable/reactivity");
  return { appAtomRegistry: AtomRegistry.make() };
});
vi.mock("../../state/projects", async () => {
  const { Atom } = await import("effect/unstable/reactivity");
  const Effect = await import("effect/Effect");
  const query = Atom.make(Effect.promise(() => state.load())).pipe(
    Atom.swr({ staleTime: 15_000, revalidateOnMount: true }),
    Atom.setIdleTTL(30_000),
  );
  return { projectEnvironment: { getAgentDelegation: () => query } };
});
vi.mock("../../state/entities", () => ({
  useProjects: () => [],
  useThreadShellsForProjectRefs: () => [],
}));

import { appAtomRegistry } from "../../rpc/atomRegistry";
import { useDelegatedAgents } from "./useDelegatedAgents";

const source = {
  environmentId: EnvironmentId.make("local"),
  threadId: ThreadId.make("source"),
};
const jobs = [
  {
    activityId: EventId.make("ack"),
    agentProjectId: ProjectId.make("friday"),
    agentThreadId: ThreadId.make("friday-chat"),
    agentName: "Friday",
    sourceMessageId: MessageId.make("request"),
    targetMessageId: MessageId.make("target-request"),
    targetTurnId: null,
  },
];
const response: AgentGetDelegationResult = {
  agentProjectId: jobs[0]!.agentProjectId,
  agentThreadId: jobs[0]!.agentThreadId,
  agentName: "Friday",
  targetMessageId: jobs[0]!.targetMessageId,
  targetTurnId: null,
  status: "working",
  messages: [],
  truncated: false,
};
function Watcher() {
  return <p>{useDelegatedAgents(source, jobs)[0]?.data?.status ?? "loading"}</p>;
}
let renderer: ReactTestRenderer | null = null;
afterEach(async () => {
  await act(() => renderer?.unmount());
  appAtomRegistry.dispose();
  vi.unstubAllGlobals();
});
const mount = async () => {
  await act(async () => {
    renderer = create(
      <RegistryContext.Provider value={appAtomRegistry}>
        <Watcher />
      </RegistryContext.Provider>,
    );
  });
};
it("refreshes a retained working job when reopening after it finished", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.load.mockResolvedValue(response);
  await mount();
  expect(renderer!.root.findByType("p").children).toEqual(["working"]);
  const initialReads = state.load.mock.calls.length;
  await act(() => renderer!.unmount());
  renderer = null;
  state.load.mockResolvedValue({ ...response, status: "completed" });
  await mount();
  expect(state.load).toHaveBeenCalledTimes(initialReads + 1);
  expect(renderer!.root.findByType("p").children).toEqual(["completed"]);
});

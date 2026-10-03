import { RegistryContext } from "@effect/atom-react";
import { EnvironmentId, EventId, MessageId, ProjectId, ThreadId } from "@t3tools/contracts";
import type { AgentGetDelegationResult } from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { makeThreadFixture } from "../../test-fixtures";
import type { Project, SidebarThreadSummary } from "../../types";

const state = vi.hoisted(() => ({
  load: vi.fn<() => Promise<AgentGetDelegationResult>>(),
  projects: [] as Project[],
  shells: [] as SidebarThreadSummary[],
}));
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
  useProjects: () => state.projects,
  useThreadShellsForProjectRefs: (
    refs: ReadonlyArray<{ environmentId: string; projectId: string }>,
  ) =>
    state.shells.filter((shell) =>
      refs.some(
        (ref) => ref.environmentId === shell.environmentId && ref.projectId === shell.projectId,
      ),
    ),
}));

import { appAtomRegistry } from "../../rpc/atomRegistry";
import { groupDelegatedAgents, useDelegatedAgents } from "./useDelegatedAgents";

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
beforeEach(() => {
  state.load.mockReset();
  state.projects = [];
  state.shells = [];
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  appAtomRegistry.reset();
  vi.unstubAllGlobals();
});
afterAll(() => appAtomRegistry.dispose());
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

it("follows group member lifecycle changes without waiting for a group response", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const lead = ProjectId.make("lead");
  const member = ProjectId.make("member");
  state.projects = [
    {
      id: jobs[0]!.agentProjectId,
      environmentId: source.environmentId,
      title: "Friday group",
      workspaceRoot: "/agents/friday",
      repositoryIdentity: null,
      scripts: [],
      defaultModelSelection: null,
      createdAt: "2026-10-03T00:00:00Z",
      updatedAt: "2026-10-03T00:00:00Z",
      agentProfile: {
        instructions: "Coordinate the team.",
        avatar: { preset: "circle", color: "#28B4FF" },
        notificationsEnabled: true,
        archived: false,
        conversationThreadId: jobs[0]!.agentThreadId,
        group: { memberProjectIds: [lead, member], leadProjectId: lead },
      },
    },
  ];
  const groupShell = makeThreadFixture({
    environmentId: source.environmentId,
    id: jobs[0]!.agentThreadId,
    projectId: jobs[0]!.agentProjectId,
  });
  const leadShell = makeThreadFixture({
    environmentId: source.environmentId,
    id: ThreadId.make("lead-chat"),
    projectId: lead,
  });
  const otherEnvironment = { ...leadShell, environmentId: EnvironmentId.make("other") };
  state.shells = [groupShell, leadShell, otherEnvironment];
  state.load.mockResolvedValue(response);
  await mount();
  const initialReads = state.load.mock.calls.length;
  state.load.mockResolvedValue({ ...response, status: "waiting" });
  // Native status can change with the same timestamp; the group never starts a provider session.
  state.shells = [groupShell, { ...leadShell, hasPendingApprovals: true }, otherEnvironment];
  await act(async () =>
    renderer!.update(
      <RegistryContext.Provider value={appAtomRegistry}>
        <Watcher />
      </RegistryContext.Provider>,
    ),
  );
  expect(state.load).toHaveBeenCalledTimes(initialReads + 1);
  expect(renderer!.root.findByType("p").children).toEqual(["waiting"]);
  state.shells = [groupShell, state.shells[1]!, { ...otherEnvironment, hasPendingUserInput: true }];
  await act(async () =>
    renderer!.update(
      <RegistryContext.Provider value={appAtomRegistry}>
        <Watcher />
      </RegistryContext.Provider>,
    ),
  );
  expect(state.load).toHaveBeenCalledTimes(initialReads + 1);
  state.load.mockResolvedValue({ ...response, status: "completed" });
  state.shells = [groupShell, { ...leadShell, hasPendingUserInput: true }];
  await act(async () =>
    renderer!.update(
      <RegistryContext.Provider value={appAtomRegistry}>
        <Watcher />
      </RegistryContext.Provider>,
    ),
  );
  expect(renderer!.root.findByType("p").children).toEqual(["completed"]);
  state.shells = [groupShell, leadShell];
  await act(async () =>
    renderer!.update(
      <RegistryContext.Provider value={appAtomRegistry}>
        <Watcher />
      </RegistryContext.Provider>,
    ),
  );
  expect(state.load).toHaveBeenCalledTimes(initialReads + 2);
});

it("counts each agent once while retaining every linked job and any active status", () => {
  const active = {
    job: jobs[0]!,
    project: undefined,
    name: "Friday",
    working: true,
    data: response,
  };
  const finished = {
    ...active,
    working: false,
    job: { ...active.job, activityId: EventId.make("later") },
    data: { ...response, status: "completed" as const },
  };
  const groups = groupDelegatedAgents([active, finished]);
  expect(groups).toHaveLength(1);
  expect(groups[0]!.working).toBe(true);
  expect(groups[0]!.jobs.map(({ job }) => job.activityId)).toEqual(["ack", "later"]);
  expect(groupDelegatedAgents([finished])[0]!.working).toBe(false);
});

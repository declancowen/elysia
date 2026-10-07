// @vitest-environment jsdom
import { RegistryContext } from "@effect/atom-react";
import {
  EnvironmentId,
  EventId,
  MessageId,
  ProjectId,
  ThreadId,
  type AgentGetDelegationResult,
} from "@t3tools/contracts";
import { type EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { makeThreadShellFixture } from "../../test-fixtures";

const state = vi.hoisted(() => ({ load: vi.fn<() => Promise<AgentGetDelegationResult>>() }));
vi.mock("../../state/atom-registry", async () => {
  const { AtomRegistry } = await import("effect/reactivity");
  return { appAtomRegistry: AtomRegistry.make() };
});
vi.mock("../../state/projects", async () => {
  const { Atom } = await import("effect/reactivity");
  const Effect = await import("effect/Effect");
  const query = Atom.make(Effect.promise(() => state.load())).pipe(
    Atom.swr({ staleTime: 15_000, revalidateOnMount: true }),
    Atom.setIdleTTL(30_000),
  );
  return { projectEnvironment: { getAgentDelegation: () => query } };
});
vi.mock("../../state/entities", () => ({ useProjects: () => [] }));
vi.mock("../../state/threads", async () => {
  const { Atom } = await import("effect/reactivity");
  const testShellsAtom = Atom.make<ReadonlyArray<EnvironmentThreadShell>>([]);
  const family = Atom.family((key: string) =>
    Atom.make((get) => {
      const refs = JSON.parse(key) as Array<{ environmentId: string; projectId: string }>;
      return get(testShellsAtom).filter((shell) =>
        refs.some(
          (ref) => ref.environmentId === shell.environmentId && ref.projectId === shell.projectId,
        ),
      );
    }),
  );
  return {
    testShellsAtom,
    environmentThreadShells: {
      threadShellsForProjectRefsAtom: (refs: unknown) => family(JSON.stringify(refs)),
    },
  };
});
import { appAtomRegistry } from "../../state/atom-registry";
import { useDelegatedAgents } from "./useDelegatedAgents";
import { Atom } from "effect/reactivity";
const { testShellsAtom } = await vi.importMock<{
  testShellsAtom: Atom.Writable<ReadonlyArray<EnvironmentThreadShell>>;
}>("../../state/threads");
const source = { environmentId: EnvironmentId.make("local"), threadId: ThreadId.make("channel") };
const jobs = [
  {
    activityId: EventId.make("ack"),
    agentProjectId: ProjectId.make("friday"),
    agentThreadId: ThreadId.make("friday-chat"),
    agentName: "Friday",
    sourceMessageId: MessageId.make("ask"),
    targetMessageId: MessageId.make("member-ask"),
    targetTurnId: null,
  },
];
const response: AgentGetDelegationResult = {
  ...jobs[0]!,
  status: "working",
  messages: [],
  truncated: false,
};
function Watcher() {
  return <p>{useDelegatedAgents(source, jobs)[0]?.working ? "Working" : "Settled"}</p>;
}
let renderer: Root | null = null;
let container: HTMLDivElement;
beforeEach(() => {
  state.load.mockReset();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = null;
  appAtomRegistry.reset();
  vi.unstubAllGlobals();
});
afterAll(() => appAtomRegistry.dispose());
const mount = async () => {
  await act(async () => {
    container = document.createElement("div");
    renderer = createRoot(container);
    renderer.render(
      <RegistryContext.Provider value={appAtomRegistry}>
        <Watcher />
      </RegistryContext.Provider>,
    );
  });
};

it("settles channel working from the original member task and ignores later unrelated member work", async () => {
  const shell = makeThreadShellFixture({
    environmentId: source.environmentId,
    id: jobs[0]!.agentThreadId,
    projectId: jobs[0]!.agentProjectId,
  });
  appAtomRegistry.set(testShellsAtom, [shell]);
  state.load.mockResolvedValue(response);
  await mount();
  expect(container.textContent).toBe("Working");
  const initialReads = state.load.mock.calls.length;
  state.load.mockResolvedValue({ ...response, status: "completed" });
  await act(async () => {
    appAtomRegistry.set(testShellsAtom, [{ ...shell, hasPendingApprovals: true }]);
  });
  expect(container.textContent).toBe("Settled");
  expect(state.load).toHaveBeenCalledTimes(initialReads + 1);
  await act(async () => {
    appAtomRegistry.set(testShellsAtom, [shell]);
  });
  expect(state.load).toHaveBeenCalledTimes(initialReads + 1);
});

it("does not leave a channel working indicator alive after the task read fails", async () => {
  state.load.mockRejectedValue(new Error("Member unavailable"));
  await mount();
  expect(container.textContent).toBe("Settled");
});

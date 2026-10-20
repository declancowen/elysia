import { EnvironmentId, ThreadId } from "@elysiatools/contracts";
import { scopeThreadRef } from "@elysiatools/client-runtime/environment";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

vi.mock("../../state/query", () => ({ useEnvironmentQuery: () => ({ data: undefined }) }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../../terminalUiStateStore", () => ({
  useTerminalUiStateStore: (select: (state: { ensureTerminal: () => void }) => unknown) =>
    select({ ensureTerminal: () => {} }),
}));

import { useWorktreeSetup } from "./useWorktreeSetup";

it("renders ordinary threads when the route reference is rebuilt on each render", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const environmentId = EnvironmentId.make("local");
  const threadId = ThreadId.make("ordinary-thread");
  function WorktreeProbe() {
    const setup = useWorktreeSetup({
      routeThreadRef: scopeThreadRef(environmentId, threadId),
      ownerKey: "ordinary-thread",
      activeThread: { id: threadId, worktreePath: null },
      threadRef: scopeThreadRef(environmentId, threadId),
      serverProjection: null,
      activityRun: null,
      localPreparing: false,
      sendQueuesBehindSetup: false,
      followUpSent: false,
    });
    return <p>{setup.blocksSend ? "Preparing" : "Ready"}</p>;
  }
  try {
    await act(() => root.render(<WorktreeProbe />));
    await act(() => root.render(<WorktreeProbe />));
    expect(host.textContent).toBe("Ready");
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

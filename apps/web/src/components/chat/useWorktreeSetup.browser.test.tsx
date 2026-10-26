import { render as renderUi } from "../../../test/render";
import { act } from "../../../test/act";
import { EnvironmentId, ThreadId } from "@elysiatools/contracts";
import { scopeThreadRef } from "@elysiatools/client-runtime/environment";

import { expect, it, vi } from "vite-plus/test";

vi.mock("../../state/query", () => ({ useEnvironmentQuery: () => ({ data: undefined }) }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../../terminalUiStateStore", () => ({
  useTerminalUiStateStore: (select: (state: { ensureTerminal: () => void }) => unknown) =>
    select({ ensureTerminal: () => {} }),
}));

import { useWorktreeSetup } from "./useWorktreeSetup";

it("renders ordinary threads when the route reference is rebuilt on each render", async () => {
  const host = document.createElement("div");
  await using root = await renderUi(null, { container: host, router: false });
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
    await act(() => root.rerender(<WorktreeProbe />));
    await act(() => root.rerender(<WorktreeProbe />));
    expect(host.textContent).toBe("Ready");
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

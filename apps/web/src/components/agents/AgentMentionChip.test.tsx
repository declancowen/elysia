// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { EnvironmentId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  project: {
    title: "Friday",
    agentProfile: { archived: false, avatar: { preset: "triangle", color: "#EEAF00" } },
  } as
    | {
        title: string;
        agentProfile: { archived: boolean; avatar: { preset: string; color: string } };
      }
    | undefined,
}));
vi.mock("~/state/entities", () => ({ useProject: () => state.project }));
import { AgentMentionChip } from "./AgentMentionChip";

it("resolves sent agent mentions to their avatar, retains archived history, and handles a missing agent", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = async (allowArchived = false) =>
    act(async () =>
      root.render(
        <AgentMentionChip
          environmentId={EnvironmentId.make("local")}
          contextId="friday"
          label="@Friday"
          copyMarkdown="agent-reference"
          allowArchived={allowArchived}
        />,
      ),
    );
  try {
    await render();
    expect(host.textContent).toContain("@Friday");
    expect(host.querySelector('path[fill="#EEAF00"]')).not.toBeNull();
    expect(host.querySelector('[data-markdown-copy="agent-reference"]')).not.toBeNull();
    state.project!.agentProfile.archived = true;
    await render(true);
    expect(host.querySelector('path[fill="#EEAF00"]')).not.toBeNull();
    await render();
    expect(host.querySelector("[data-context-unresolved]")).not.toBeNull();
    state.project = undefined;
    await render(true);
    expect(host.textContent).toContain("@Friday");
    expect(host.querySelector("[data-context-unresolved]")).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

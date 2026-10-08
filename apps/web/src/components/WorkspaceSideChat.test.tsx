// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  ProjectId,
  WorkTaskId,
  PageId,
  type ThreadId,
} from "@elysiatools/contracts";
import { useWorkspaceSideChat } from "./WorkspaceSideChat";
import { useComposerDraftStore } from "../composerDraftStore";

const state = vi.hoisted(() => ({
  linked: [] as string[],
  shells: [] as {
    id: string;
    title: string;
    environmentId: string;
    projectId: string;
    archivedAt: string | null;
  }[],
  projects: [
    { id: "project", environmentId: "local", workspaceRoot: "/work", title: "Project" },
    { id: "scratch", environmentId: "local", workspaceRoot: "/scratch", title: "No project" },
  ],
  refresh: vi.fn(),
  link: vi.fn(async (_input: unknown) => ({ _tag: "Success", value: {} })),
  scratch: vi.fn(async () => ({ _tag: "Success", value: { projectId: "scratch" } })),
  create: vi.fn(),
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => new Map() }));
vi.mock("../hooks/useRegularProjects", () => ({ useRegularProjects: () => state.projects }));
vi.mock("../state/entities", () => ({
  useThreadShells: () => state.shells,
  waitForProject: async (ref: { projectId: string }) =>
    state.projects.find((project) => project.id === ref.projectId),
  waitForThreadShell: async () => ({}),
}));
vi.mock("../state/server", () => ({
  serverEnvironment: { workspaceChats: () => ({}), linkWorkspaceChat: state.link },
  environmentServerConfigsAtom: {},
}));
vi.mock("../state/projects", () => ({ projectEnvironment: { ensureScratch: state.scratch } }));
vi.mock("../state/threads", () => ({ threadEnvironment: { create: state.create } }));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: (command: unknown) => command }));
vi.mock("../state/query", () => ({
  useEnvironmentQuery: () => ({
    data: { threadIds: state.linked },
    error: null,
    refresh: state.refresh,
  }),
}));
vi.mock("../providerModels", () => ({ getDefaultServerModel: () => "test-model" }));
vi.mock("./ChatView", () => ({
  default: ({
    threadId,
    routeKind,
    onThreadStarted,
    onBeforeThreadStarted,
  }: {
    threadId: ThreadId;
    routeKind: string;
    onThreadStarted?: (id: ThreadId) => Promise<void>;
    onBeforeThreadStarted?: (id: ThreadId, projectId: ProjectId) => Promise<void>;
  }) => (
    <button
      data-route-kind={routeKind}
      onClick={() =>
        void (async () => {
          const draft = Object.values(
            useComposerDraftStore.getState().draftThreadsByThreadKey,
          ).find((draft) => draft.threadId === threadId)!;
          await onBeforeThreadStarted?.(threadId, draft.projectId);
          await onThreadStarted?.(threadId);
        })()
      }
    >
      Send first message
    </button>
  ),
}));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  state.linked = [];
  state.shells = [];
  vi.clearAllMocks();
  useComposerDraftStore.setState(useComposerDraftStore.getInitialState(), true);
});

it.each(["page", "task"] as const)(
  "keeps a %s chat local until first send, preserves project ownership, and excludes agent/archived chats",
  async (kind) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const target =
      kind === "page"
        ? { kind, id: PageId.make("page-11111111-1111-1111-1111-111111111111") }
        : { kind, id: WorkTaskId.make("TASK-1") };
    function Harness({ projectId }: { projectId: ProjectId | null }) {
      return useWorkspaceSideChat({
        environmentId: EnvironmentId.make("local"),
        target,
        title: "Document",
        projectId,
        onOpen: () => {},
      }).panel;
    }
    const click = async (label: string) => {
      const button = [...document.querySelectorAll("button")].find(
        (button) => button.getAttribute("aria-label") === label || button.textContent === label,
      );
      expect(button).toBeDefined();
      await act(async () => button!.click());
    };
    try {
      await act(async () => root.render(<Harness projectId={ProjectId.make("project")} />));
      expect(state.create).not.toHaveBeenCalled();
      expect(state.link).not.toHaveBeenCalled();
      await click("Open side chat");
      expect(state.create).not.toHaveBeenCalled();
      expect(state.link).not.toHaveBeenCalled();
      const first = Object.values(useComposerDraftStore.getState().draftThreadsByThreadKey)[0]!;
      expect(first.projectId).toBe("project");
      expect(host.querySelector("[data-route-kind]")?.getAttribute("data-route-kind")).toBe(
        "draft",
      );
      await click("Send first message");
      expect(state.link).toHaveBeenCalledWith({
        environmentId: "local",
        input: { target, threadId: first.threadId, linked: true, draftProjectId: "project" },
      });
      state.linked = [first.threadId, "agent-thread", "archived"];
      state.shells = [
        {
          id: first.threadId,
          title: "Generated context title",
          environmentId: "local",
          projectId: "project",
          archivedAt: null,
        },
        {
          id: "agent-thread",
          title: "Agent task run",
          environmentId: "local",
          projectId: "agent",
          archivedAt: null,
        },
        {
          id: "archived",
          title: "Archived chat",
          environmentId: "local",
          projectId: "project",
          archivedAt: "2026-10-05",
        },
      ];
      await act(async () => root.render(<Harness projectId={ProjectId.make("project")} />));
      expect(host.textContent).toContain("Generated context title");
      expect(host.querySelector("[data-route-kind]")?.getAttribute("data-route-kind")).toBe(
        "server",
      );
      await click("Linked chats");
      expect(document.body.textContent).not.toContain("Agent task run");
      expect(document.body.textContent).not.toContain("Archived chat");
      await act(async () =>
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
      );
      await act(async () => root.render(<Harness projectId={null} />));
      await click("New linked chat");
      const second = Object.values(useComposerDraftStore.getState().draftThreadsByThreadKey).at(
        -1,
      )!;
      expect(second.projectId).toBe("scratch");
      expect(state.scratch).toHaveBeenCalledOnce();
      expect(state.create).not.toHaveBeenCalled();
      // A freshly promoted chat can be archived before its link query refreshes.
      state.shells = [
        ...state.shells,
        {
          id: second.threadId,
          title: "Archived pending chat",
          environmentId: "local",
          projectId: "scratch",
          archivedAt: "2026-10-05",
        },
      ];
      await act(async () => root.render(<Harness projectId={null} />));
      expect(host.textContent).not.toContain("Archived pending chat");
      expect(host.textContent).toContain("Generated context title");
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  },
);

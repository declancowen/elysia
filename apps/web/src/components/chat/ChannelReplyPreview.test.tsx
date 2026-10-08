import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, ThreadId } from "@elysiatools/contracts";
import { scopeThreadRef } from "@elysiatools/client-runtime/environment";
import type { ChatMessage } from "~/types";
import { ChannelReplyPreview } from "./ChannelReplyPreview";
vi.mock("~/state/entities", () => ({
  useThreadShell: () => null,
  useServerConfigs: () => new Map(),
  useProjects: () => [],
  useProject: () => ({
    title: "Alfred",
    agentProfile: { avatar: { preset: "brain", color: "pink" } },
  }),
}));
vi.mock("../agents/AgentAvatar", () => ({ AgentAvatar: () => null }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/scroll-area", () => ({ ScrollArea: "section" }));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => null }));
vi.mock("~/hooks/useTheme", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
vi.mock("~/state/use-atom-query-runner", () => ({ useAtomQueryRunner: () => vi.fn() }));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("~/state/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/state/session")>()),
  usePreparedConnection: () => ({ _tag: "Loading" }),
}));
vi.mock("~/remoteOpen", () => ({
  useRemoteOpenResolution: () => ({ state: { mode: "local-exec" }, isResolved: true }),
}));
vi.mock("~/editorPreferences", () => ({
  useOpenInPreferredEditor: () => vi.fn(),
  usePreferredEditor: () => [null, vi.fn()],
}));
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(() => renderer?.unmount());
  vi.unstubAllGlobals();
});
it("identifies the channel author, expands the referenced response and cancels reply mode", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const cancel = vi.fn();
  await act(() => {
    renderer = create(
      <ChannelReplyPreview
        message={
          {
            id: "reply",
            role: "assistant",
            text: "**Task:** A full response with *context*",
            attachments: [],
          } as unknown as ChatMessage
        }
        threadRef={scopeThreadRef(EnvironmentId.make("local"), ThreadId.make("channel"))}
        memberProjectId={ProjectId.make("alfred")}
        onCancel={cancel}
      />,
    );
  });
  expect(JSON.stringify(renderer!.toJSON())).toContain("Alfred");
  expect(renderer!.root.findAllByType("section")).toHaveLength(0);
  expect(renderer!.root.findAllByType("strong")).toHaveLength(1);
  expect(JSON.stringify(renderer!.toJSON())).not.toContain("**Task:**");
  await act(() =>
    renderer!.root.findByProps({ "aria-label": "Expand reply preview" }).props.onClick(),
  );
  expect(renderer!.root.findAllByType("section")).toHaveLength(1);
  expect(renderer!.root.findAllByType("strong")).toHaveLength(1);
  expect(JSON.stringify(renderer!.toJSON())).not.toContain("**Task:**");
  expect(renderer!.root.findAllByType("em")).toHaveLength(1);
  await act(() =>
    renderer!.root.findByProps({ "aria-label": "Collapse reply preview" }).props.onClick(),
  );
  expect(renderer!.root.findAllByType("section")).toHaveLength(0);
  await act(() => renderer!.root.findByProps({ "aria-label": "Cancel reply" }).props.onClick());
  expect(cancel).toHaveBeenCalledOnce();
});

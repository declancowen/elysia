import { renderToStaticMarkup } from "react-dom/server";
import { cloneElement, createRef, type ReactElement, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { act } from "../../../test/act";
import { describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  projection: null as unknown,
  workflow: null as unknown,
  actions: [] as { command: symbol; input: unknown }[],
}));

vi.mock("@elysiatools/client-runtime/environment", () => ({
  scopeThreadRef: () => ({}) as never,
}));

vi.mock("@elysiatools/client-runtime/state/thread-workflows", () => ({
  deriveThreadQueueWorkflowState: () => state.workflow,
}));

vi.mock("../../state/entities", () => ({
  useThreadProjection: () => state.projection,
  useQuietThreadShell: () => null,
}));

vi.mock("../../state/threads", () => ({
  threadEnvironment: {
    cancelQueuedRun: Symbol("cancelQueuedRun"),
    promoteQueuedRun: Symbol("promoteQueuedRun"),
    resumeThreadQueue: Symbol("resumeThreadQueue"),
  },
}));

vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: symbol) => async (input: unknown) => {
    state.actions.push({ command, input });
    return { _tag: "Success", value: undefined };
  },
}));

vi.mock("../../assets/assetUrls", () => ({
  useAssetUrls: (_environmentId: never, resources: ReadonlyArray<{ attachmentId: string }>) =>
    resources.map((resource) => `https://assets.test/${resource.attachmentId}`),
}));

// These attribution-only browser leaves are not queue controllers; importing the
// full timeline here would also start its browser diff-worker dependency graph.
vi.mock("./TimelineUserMessageRow", () => ({
  FoldedMessageHeader: () => null,
  useScheduledTaskTitle: () => undefined,
}));

// Queue actions do not depend on portal/focus behavior; keep that browser-only
// tooltip leaf out of this Node renderer while retaining its real button child.
vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => children,
  TooltipTrigger: ({
    children,
    render,
  }: {
    children?: ReactNode;
    render?: ReactElement<{ children?: ReactNode }>;
  }) => (render ? cloneElement(render, undefined, children) : children),
  TooltipPopup: () => null,
}));

import { threadEnvironment } from "../../state/threads";
import { QueuedRunsControl, type QueuedRunsControlHandle } from "./QueuedRunsControl";

describe("QueuedRunsControl automatic completion delivery", () => {
  it("does not render a queue control when only hidden delivery remains", () => {
    state.projection = {
      projection: {
        messages: [
          {
            delegatedCompletion: {
              parentRunId: "run:parent",
              generation: 1,
              taskIds: ["task:child"],
            },
            id: "message:completion",
          },
        ],
      },
    };
    state.workflow = {
      activeRun: { id: "run:active" },
      canPromoteToSteer: true,
      canReorder: true,
      queuedRuns: [],
    };

    const html = renderToStaticMarkup(
      <QueuedRunsControl
        editBlockedReason={null}
        timestampFormat="locale"
        onOpenThread={() => {}}
        environmentId={"environment:test" as never}
        optimisticMessages={[]}
        threadId={"thread:test" as never}
        editingRunId={null}
        onEditQueuedRun={() => undefined}
        onCancelEdit={() => undefined}
      />,
    );

    expect(html).toBe("");
  });
});

describe("QueuedRunsControl attachments and edit mode", () => {
  const workflowWithAttachment = () => ({
    activeRun: { id: "run:active" },
    canPromoteToSteer: true,
    canReorder: true,
    queuedRuns: [
      {
        run: { id: "run:queued", userMessageId: "message:queued" },
        text: "Queued with a screenshot",
        attachments: [
          {
            type: "image",
            id: "attachment-1",
            name: "screenshot.png",
            mimeType: "image/png",
            sizeBytes: 128,
          },
        ],
      },
    ],
  });

  it("keeps the attachment available for editing and steers its queued run", async () => {
    state.projection = { projection: { messages: [] } };
    state.workflow = workflowWithAttachment();
    state.actions = [];
    const onEdit = vi.fn();
    const control = createRef<QueuedRunsControlHandle>();
    let renderer: ReactTestRenderer | undefined;
    try {
      await act(() => {
        renderer = create(
          <QueuedRunsControl
            ref={control}
            editBlockedReason={null}
            timestampFormat="locale"
            onOpenThread={() => {}}
            environmentId={"environment:test" as never}
            optimisticMessages={[]}
            threadId={"thread:test" as never}
            editingRunId={null}
            onEditQueuedRun={onEdit}
            onCancelEdit={() => {}}
          />,
        );
      });
      expect(renderer!.root.findByType("img").props.src).toBe("https://assets.test/attachment-1");
      expect(renderer!.root.findByProps({ children: "Queued with a screenshot" })).toBeDefined();
      await act(() => {
        expect(control.current!.editLatest(false)).toBe(true);
      });
      expect(onEdit).toHaveBeenCalledExactlyOnceWith({
        runId: "run:queued",
        messageId: "message:queued",
        text: "Queued with a screenshot",
        attachments: [expect.objectContaining({ id: "attachment-1", name: "screenshot.png" })],
      });
      await act(async () => {
        expect(control.current!.steerNext(false)).toBe(true);
      });
      expect(state.actions).toEqual([
        {
          command: threadEnvironment.promoteQueuedRun,
          input: {
            environmentId: "environment:test",
            input: {
              threadId: "thread:test",
              queuedRunId: "run:queued",
              targetRunId: "run:active",
            },
          },
        },
      ]);
    } finally {
      await act(() => renderer?.unmount());
    }
  });

  it("drops the optimistic pending row once the projection holds its message", () => {
    state.projection = {
      projection: { messages: [{ id: "message:acknowledged", text: "hello" }] },
    };
    state.workflow = {
      activeRun: { id: "run:active" },
      canPromoteToSteer: true,
      canReorder: true,
      queuedRuns: [],
    };

    const html = renderToStaticMarkup(
      <QueuedRunsControl
        editBlockedReason={null}
        timestampFormat="locale"
        onOpenThread={() => {}}
        environmentId={"environment:test" as never}
        optimisticMessages={[
          {
            id: "message:acknowledged" as never,
            inputIntent: "queued_turn",
            text: "hello",
            attachments: [],
          },
        ]}
        threadId={"thread:test" as never}
        editingRunId={null}
        onEditQueuedRun={() => undefined}
        onCancelEdit={() => undefined}
      />,
    );

    expect(html).toBe("");
  });

  it("keeps the original queued message visible while editing", () => {
    state.projection = { projection: { messages: [] } };
    state.workflow = workflowWithAttachment();

    const html = renderToStaticMarkup(
      <QueuedRunsControl
        editBlockedReason={null}
        timestampFormat="locale"
        onOpenThread={() => {}}
        environmentId={"environment:test" as never}
        optimisticMessages={[]}
        threadId={"thread:test" as never}
        editingRunId={"run:queued" as never}
        onEditQueuedRun={() => undefined}
        onCancelEdit={() => undefined}
      />,
    );

    expect(html).toContain("Queued with a screenshot");
  });
});

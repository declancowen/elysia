import { render as renderUi, type Screen } from "../../test/render";
import { act } from "../../test/act";

import { expect, it, vi } from "vite-plus/test";

import type { TimelineEntriesInput } from "../session-logic";
import { makeStreamingTimelineFixture } from "../test-fixtures";
import { useIncrementalTimelineEntries } from "./useIncrementalTimelineEntries";
import { MessageId } from "@elysiatools/contracts";

let root: Screen;
let host: HTMLDivElement;

async function setup() {
  const resources = new AsyncDisposableStack();
  resources.defer(async () => {
    vi.unstubAllGlobals();
  });

  host = document.createElement("div");
  root = resources.use(await renderUi(null, { container: host, router: false }));

  return resources;
}

function TimelineProbe({
  threadKey = "thread-one",
  items,
  feedback,
}: {
  threadKey?: string;
  items: TimelineEntriesInput["visibleTurnItems"];
  feedback?: string;
}) {
  const entries = useIncrementalTimelineEntries(threadKey, {
    visibleTurnItems: [...items],
    optimisticMessages: [],
    anchoredMessages: feedback
      ? [
          {
            id: MessageId.make("feedback"),
            role: "assistant",
            text: feedback,
            runId: null,
            streaming: false,
            createdAt: "2026-09-04T00:01:00Z",
            updatedAt: "2026-09-04T00:01:00Z",
          },
        ]
      : [],
    attachmentUrlById: new Map(),
    attempts: [],
    nodes: [],
    plans: [],
  });
  return (
    <div>
      {entries.map((entry) =>
        entry.kind === "message" ? <p key={entry.id}>{entry.message.text}</p> : null,
      )}
    </div>
  );
}

it("keeps ordinary conversation content stable when callers rebuild equivalent containers", async () => {
  await using _fixture = await setup();
  const fixture = makeStreamingTimelineFixture("Current response");
  await act(() => root.rerender(<TimelineProbe items={fixture.visibleTurnItems} />));
  const firstMessage = host.querySelector("p");
  await act(() => root.rerender(<TimelineProbe items={fixture.visibleTurnItems} />));
  expect(host.textContent).toContain("Current response");
  expect(host.querySelector("p")).toBe(firstMessage);

  const updated = makeStreamingTimelineFixture("Updated response");
  await act(() => root.rerender(<TimelineProbe items={updated.visibleTurnItems} />));
  expect(host.textContent).toContain("Updated response");
  expect(host.textContent).not.toContain("Current response");
});

it("clears the previous conversation when an empty thread is selected", async () => {
  await using _fixture = await setup();
  const fixture = makeStreamingTimelineFixture("Previous conversation");
  await act(() => root.rerender(<TimelineProbe items={fixture.visibleTurnItems} />));
  await act(() => root.rerender(<TimelineProbe threadKey="thread-two" items={[]} />));
  expect(host.textContent).toBe("");
});

it("keeps derived feedback visible and accepts its next content update", async () => {
  await using _fixture = await setup();
  const fixture = makeStreamingTimelineFixture("Current response");
  await act(() =>
    root.rerender(<TimelineProbe items={fixture.visibleTurnItems} feedback="Feedback received" />),
  );
  await act(() =>
    root.rerender(<TimelineProbe items={fixture.visibleTurnItems} feedback="Feedback received" />),
  );
  expect(host.textContent).toContain("Feedback received");
  await act(() =>
    root.rerender(<TimelineProbe items={fixture.visibleTurnItems} feedback="Feedback completed" />),
  );
  expect(host.textContent).toContain("Feedback completed");
  expect(host.textContent).not.toContain("Feedback received");
});

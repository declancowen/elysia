import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import type { TimelineEntriesInput } from "../session-logic";
import { makeStreamingTimelineFixture } from "../test-fixtures";
import { useIncrementalTimelineEntries } from "./useIncrementalTimelineEntries";
import { MessageId } from "@elysiatools/contracts";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  vi.unstubAllGlobals();
});

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
  const fixture = makeStreamingTimelineFixture("Current response");
  await act(() => root.render(<TimelineProbe items={fixture.visibleTurnItems} />));
  const firstMessage = host.querySelector("p");
  await act(() => root.render(<TimelineProbe items={fixture.visibleTurnItems} />));
  expect(host.textContent).toContain("Current response");
  expect(host.querySelector("p")).toBe(firstMessage);

  const updated = makeStreamingTimelineFixture("Updated response");
  await act(() => root.render(<TimelineProbe items={updated.visibleTurnItems} />));
  expect(host.textContent).toContain("Updated response");
  expect(host.textContent).not.toContain("Current response");
});

it("clears the previous conversation when an empty thread is selected", async () => {
  const fixture = makeStreamingTimelineFixture("Previous conversation");
  await act(() => root.render(<TimelineProbe items={fixture.visibleTurnItems} />));
  await act(() => root.render(<TimelineProbe threadKey="thread-two" items={[]} />));
  expect(host.textContent).toBe("");
});

it("keeps derived feedback visible and accepts its next content update", async () => {
  const fixture = makeStreamingTimelineFixture("Current response");
  await act(() =>
    root.render(<TimelineProbe items={fixture.visibleTurnItems} feedback="Feedback received" />),
  );
  await act(() =>
    root.render(<TimelineProbe items={fixture.visibleTurnItems} feedback="Feedback received" />),
  );
  expect(host.textContent).toContain("Feedback received");
  await act(() =>
    root.render(<TimelineProbe items={fixture.visibleTurnItems} feedback="Feedback completed" />),
  );
  expect(host.textContent).toContain("Feedback completed");
  expect(host.textContent).not.toContain("Feedback received");
});

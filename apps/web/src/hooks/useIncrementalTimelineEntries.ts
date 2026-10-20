import { useState } from "react";
import { shallow } from "zustand/shallow";
import * as Equal from "effect/Equal";
import {
  deriveTimelineEntriesFromVisibleTurnItemsWithState,
  type TimelineEntriesInput,
  type TimelineEntriesProjection,
} from "../session-logic";

function sameInput(left: TimelineEntriesInput, right: TimelineEntriesInput): boolean {
  return (
    shallow(left.visibleTurnItems, right.visibleTurnItems) &&
    shallow(left.optimisticMessages, right.optimisticMessages) &&
    // Feedback messages are derived records, rebuilt with their containers.
    Equal.equals(left.anchoredMessages, right.anchoredMessages) &&
    shallow(left.attachmentUrlById, right.attachmentUrlById) &&
    shallow(left.attempts, right.attempts) &&
    shallow(left.nodes, right.nodes) &&
    shallow(left.plans, right.plans)
  );
}

/**
 * Timeline entries for a thread, derived from the previous projection so
 * unchanged rows keep their identity and memoized rows skip rendering. A new
 * thread starts from scratch.
 */
export function useIncrementalTimelineEntries(
  threadKey: string | null,
  input: TimelineEntriesInput,
): TimelineEntriesProjection["entries"] {
  const [state, setState] = useState(() => ({
    threadKey,
    projection: deriveTimelineEntriesFromVisibleTurnItemsWithState(input),
  }));
  if (state.threadKey === threadKey && sameInput(state.projection.input, input)) {
    return state.projection.entries;
  }
  const projection = deriveTimelineEntriesFromVisibleTurnItemsWithState(
    input,
    state.threadKey === threadKey ? state.projection : null,
  );
  setState({ threadKey, projection });
  return projection.entries;
}

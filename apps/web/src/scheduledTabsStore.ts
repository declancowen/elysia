import type { EnvironmentId, ScheduledTask } from "@t3tools/contracts";
import { createPaneTabsStore } from "./paneTabsStore";

export type ScheduledTabTarget =
  | { kind: "empty" }
  | { kind: "task"; environmentId: EnvironmentId; task: ScheduledTask | null };

export function scheduledTabKey(target: ScheduledTabTarget) {
  return target.kind === "empty" ? "empty" : `${target.environmentId}:${target.task?.id ?? "new"}`;
}

export const useScheduledTabsStore = createPaneTabsStore<ScheduledTabTarget>(scheduledTabKey);

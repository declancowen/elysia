import type { EnvironmentId, ScheduledTask } from "@t3tools/contracts";

export type ScheduledTabTarget =
  | { kind: "empty" }
  | { kind: "task"; environmentId: EnvironmentId; task: ScheduledTask | null };

export function scheduledTabKey(target: ScheduledTabTarget) {
  return target.kind === "empty" ? "empty" : `${target.environmentId}:${target.task?.id ?? "new"}`;
}

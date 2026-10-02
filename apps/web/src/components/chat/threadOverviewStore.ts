import type { ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";

/** One-shot navigation from a sent agent mention into its source chat's overview. */
export const useThreadOverviewStore = create<{
  target: { source: ScopedThreadRef; projectId: ProjectId } | null;
}>(() => ({ target: null }));

export function openThreadOverviewAgent(source: ScopedThreadRef, projectId: ProjectId) {
  useThreadOverviewStore.setState({ target: { source, projectId } });
}

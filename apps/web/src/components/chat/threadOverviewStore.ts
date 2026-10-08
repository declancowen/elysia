import type { ProjectId, ScopedThreadRef } from "@elysiatools/contracts";
import { create } from "zustand";

/** One-shot navigation from a sent agent mention into its source chat's overview. */
export const useThreadOverviewStore = create<{
  target: { source: ScopedThreadRef; projectId: ProjectId } | null;
  toggle: ScopedThreadRef | null;
}>(() => ({ target: null, toggle: null }));

export function openThreadOverviewAgent(source: ScopedThreadRef, projectId: ProjectId) {
  useThreadOverviewStore.setState({ target: { source, projectId } });
}

/** The remappable details shortcut opens Elysia's existing overview surface. */
export function toggleThreadOverview(source: ScopedThreadRef) {
  useThreadOverviewStore.setState({ toggle: source });
}

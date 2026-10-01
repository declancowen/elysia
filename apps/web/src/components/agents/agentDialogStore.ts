import type { ScopedProjectRef } from "@t3tools/contracts";
import { create } from "zustand";

export const useAgentDialogStore = create<{
  target: { readonly projectRef: ScopedProjectRef | null } | null;
}>(() => ({ target: null }));

export function openAgentDialog(projectRef: ScopedProjectRef | null = null): void {
  useAgentDialogStore.setState({ target: { projectRef } });
}

export function closeAgentDialog(): void {
  useAgentDialogStore.setState({ target: null });
}

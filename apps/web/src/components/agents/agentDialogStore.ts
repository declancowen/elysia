import type { ScopedProjectRef } from "@t3tools/contracts";
import { create } from "zustand";

type AgentEditorTarget = { readonly projectRef: ScopedProjectRef | null };

export const useAgentDialogStore = create<{
  target: AgentEditorTarget | null;
  returnHref: string | null;
}>(() => ({ target: null, returnHref: null }));

export function openAgentDialog(projectRef: ScopedProjectRef | null = null): void {
  useAgentDialogStore.setState({
    target: { projectRef: projectRef ? { ...projectRef } : null },
  });
}

export function closeAgentDialog(): void {
  useAgentDialogStore.setState({ target: null, returnHref: null });
}

/** The editor is a route; existing menu and palette callers send a one-shot navigation intent. */
export function consumeAgentEditorIntent(
  target: AgentEditorTarget,
  originHref: string,
  isEditorPage: boolean,
): boolean {
  const current = useAgentDialogStore.getState();
  if (current.target !== target) return false;
  useAgentDialogStore.setState({
    target: null,
    returnHref: isEditorPage ? current.returnHref : originHref,
  });
  return true;
}

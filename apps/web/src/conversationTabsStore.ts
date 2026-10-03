import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ThreadRouteTarget } from "./threadRoutes";
import { createPaneTabsStore } from "./paneTabsStore";
import { useAgentSidebarStore } from "./components/agents/agentSidebarStore";

export interface ConversationTab {
  id: string;
  target: ThreadRouteTarget;
}

function targetKey(target: ThreadRouteTarget) {
  return target.kind === "draft"
    ? `draft:${target.draftId}`
    : `server:${scopedThreadKey(target.threadRef)}`;
}

export const useConversationTabsStore = createPaneTabsStore<ThreadRouteTarget>(targetKey);
export const useAgentConversationTabsStore = createPaneTabsStore<ThreadRouteTarget>(targetKey);

export function currentConversationTabsStore() {
  return useAgentSidebarStore.getState().active
    ? useAgentConversationTabsStore
    : useConversationTabsStore;
}

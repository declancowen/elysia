import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ThreadRouteTarget } from "./threadRoutes";
import type { PullRequestRowTarget } from "./components/pullRequest/PullRequestRow";
import { createPaneTabsStore } from "./paneTabsStore";

export type ConversationTabTarget =
  | ThreadRouteTarget
  | ({ kind: "pull-request" } & PullRequestRowTarget);
export interface ConversationTab {
  id: string;
  target: ConversationTabTarget;
}

function targetKey(target: ConversationTabTarget) {
  if (target.kind === "pull-request") {
    return JSON.stringify([
      target.kind,
      target.environmentId,
      target.projectId,
      target.host.toLowerCase(),
      target.repository,
      target.number,
    ]);
  }
  return target.kind === "draft"
    ? `draft:${target.draftId}`
    : `server:${scopedThreadKey(target.threadRef)}`;
}

// Navigation is shared; thread history and pull-request surfaces retain their domain owners.
export const useConversationTabsStore = createPaneTabsStore<ConversationTabTarget>(targetKey);
export function currentConversationTabsStore() {
  return useConversationTabsStore;
}

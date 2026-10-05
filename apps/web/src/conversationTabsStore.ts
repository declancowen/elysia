import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ThreadRouteTarget } from "./threadRoutes";
import type { PullRequestRowTarget } from "./components/pullRequest/PullRequestRow";
import type { EnvironmentId, PageId, WorkTaskId } from "@t3tools/contracts";
import { createPaneTabsStore } from "./paneTabsStore";

export type WorkspaceItemTabTarget =
  | { kind: "page"; environmentId: EnvironmentId; id: PageId | null; title: string }
  | { kind: "task"; environmentId: EnvironmentId; id: WorkTaskId | null; title: string };

export type ConversationTabTarget =
  | WorkspaceItemTabTarget
  | ThreadRouteTarget
  | ({ kind: "pull-request" } & PullRequestRowTarget);
export interface ConversationTab {
  id: string;
  target: ConversationTabTarget;
}

function targetKey(target: ConversationTabTarget) {
  if (target.kind === "page" || target.kind === "task") {
    return JSON.stringify([target.kind, target.environmentId, target.id]);
  }
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

// Tabs share navigation; each content surface retains its domain owner.
export const useConversationTabsStore = createPaneTabsStore<ConversationTabTarget>(targetKey);
export function currentConversationTabsStore() {
  return useConversationTabsStore;
}

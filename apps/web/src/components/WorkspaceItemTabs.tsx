import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useConversationTabsStore, type WorkspaceItemTabTarget } from "../conversationTabsStore";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useAppTopbarHost } from "./AppTopbar";
import { ConversationTabs } from "./chat/ConversationTabs";

/** Register direct links and keep tab titles current after editing. */
export function WorkspaceItemTabs({ target }: { target: WorkspaceItemTabTarget | null }) {
  const host = useAppTopbarHost();
  const desktop = useMediaQuery("(min-width: 768px)");
  useEffect(() => {
    if (!target) return;
    const state = useConversationTabsStore.getState();
    if (target.kind === "agent-create") {
      state.open(target, true);
      return;
    }
    const existing = state.tabs.find(
      ({ target: item }) =>
        item.kind === target.kind &&
        item.environmentId === target.environmentId &&
        item.id === target.id,
    );
    if (
      existing &&
      (existing.target.kind === "page" || existing.target.kind === "task") &&
      existing.target.title !== target.title
    )
      state.retarget(existing.target, target);
    state.open(
      target,
      state.tabs.find((tab) => tab.id === state.activeId)?.target.kind !== target.kind,
    );
  }, [target]);
  return desktop && host ? createPortal(<ConversationTabs />, host) : <ConversationTabs />;
}

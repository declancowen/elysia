import { readPullRequestListPreferences } from "../components/pullRequest/pullRequestListPreferences";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useConversationTabsStore, type ConversationTabTarget } from "../conversationTabsStore";
import { readProject, readThreadShell } from "../state/entities";
import { buildDraftThreadRouteParams, buildThreadRouteParams } from "../threadRoutes";
import { setAgentSidebarActive } from "../components/agents/agentSidebarStore";

/** A session tab selects both its content route and the sidebar that owns that content. */
export function useConversationTabNavigation() {
  const navigate = useNavigate();
  return useCallback(
    (target: ConversationTabTarget, replace = false) => {
      if (target.kind === "pull-request") {
        setAgentSidebarActive(false);
        return navigate({
          to: "/pull-requests",
          replace,
          search: {
            ...readPullRequestListPreferences(),
            repository: target.repository,
            number: target.number,
            selectedHost: target.host,
            selectedProjectId: target.projectId,
            selectedEnvironmentId: target.environmentId,
          },
        });
      }
      if (target.kind === "draft") {
        setAgentSidebarActive(false);
        return navigate({
          to: "/draft/$draftId",
          params: buildDraftThreadRouteParams(target.draftId),
          replace,
        });
      }
      setAgentSidebarActive(tabSection(target) === "agents");
      return navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(target.threadRef),
        replace,
      });
    },
    [navigate],
  );
}

type TabSection = "workspace" | "agents" | "pull-requests";
function tabSection(target: ConversationTabTarget): TabSection {
  if (target.kind === "pull-request") return "pull-requests";
  if (target.kind === "draft") return "workspace";
  const thread = readThreadShell(target.threadRef);
  const project = thread
    ? readProject(scopeProjectRef(target.threadRef.environmentId, thread.projectId))
    : null;
  return project?.agentProfile ? "agents" : "workspace";
}

/** Rail navigation reuses that section's tab; a first visit leaves room for its default tab. */
export function useConversationSectionNavigation() {
  const navigateTab = useConversationTabNavigation();
  return useCallback(
    (section: TabSection) => {
      const tabs = useConversationTabsStore.getState();
      const active = tabs.tabs.find(
        (tab) => tab.id === tabs.activeId && tabSection(tab.target) === section,
      );
      const tab =
        active ?? tabs.tabs.toReversed().find((tab) => tabSection(tab.target) === section);
      tabs.activate(tab?.id ?? null);
      if (!tab) return false;
      void navigateTab(tab.target);
      return true;
    },
    [navigateTab],
  );
}

import { readPullRequestListPreferences } from "../components/pullRequest/pullRequestListPreferences";
import { scopeProjectRef } from "@elysiatools/client-runtime/environment";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { useConversationTabsStore, type ConversationTabTarget } from "../conversationTabsStore";
import { useProjects, useThreadShells, readProject, readThreadShell } from "../state/entities";
import { buildDraftThreadRouteParams, buildThreadRouteParams } from "../threadRoutes";
import { setAgentSidebarActive } from "../components/agents/agentSidebarStore";

/** A session tab selects both its content route and the sidebar that owns that content. */
export function useConversationTabNavigation() {
  const navigate = useNavigate();
  return useCallback(
    (target: ConversationTabTarget, replace = false) => {
      if (target.kind === "surface") {
        setAgentSidebarActive(target.path === "/agents");
        return navigate({
          to: target.path,
          search: { project: undefined, machine: undefined, checkout: undefined, ...target.search },
          replace,
        });
      }
      if (target.kind === "scheduled") {
        setAgentSidebarActive(false);
        return navigate({
          to: "/settings/scheduled-tasks",
          search:
            target.selection.kind === "task"
              ? { machine: target.selection.environmentId }
              : { machine: undefined, project: undefined, checkout: undefined },
          replace,
        });
      }
      if (target.kind === "agent-create") {
        setAgentSidebarActive(true);
        return navigate({
          to: "/agents",
          search: { create: true, ...(target.channel ? { channel: true } : {}) },
          replace,
        });
      }
      if (target.kind === "page" || target.kind === "task") {
        setAgentSidebarActive(false);
        if (target.kind === "task")
          return navigate({ to: "/tasks", search: target.id ? { task: target.id } : {}, replace });
        return target.id
          ? navigate({ to: "/pages/$pageId", params: { pageId: target.id }, replace })
          : navigate({ to: "/pages", replace });
      }
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

type TabSection =
  | "workspace"
  | "agents"
  | "pull-requests"
  | "pages"
  | "tasks"
  | "scheduled"
  | "projects"
  | "settings"
  | "stats";
function tabSection(target: ConversationTabTarget): TabSection {
  if (target.kind === "scheduled") return "scheduled";
  if (target.kind === "surface")
    return target.path === "/projects"
      ? "projects"
      : target.path === "/usage"
        ? "stats"
        : target.path === "/agents"
          ? "agents"
          : "settings";
  if (target.kind === "agent-create") return "agents";
  if (target.kind === "page") return "pages";
  if (target.kind === "task") return "tasks";
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

/** Archives can arrive from menus, Settings, or another client, including for inactive tabs. */
export function useArchivedConversationTabs() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const projects = useProjects();
  const threads = useThreadShells();
  const { tabs, activeId, forget } = useConversationTabsStore();
  const navigateTab = useConversationTabNavigation();
  const navigate = useNavigate();
  useEffect(() => {
    const archived = tabs.filter(({ target }) => {
      if (target.kind !== "server") return false;
      const thread = threads.find(
        (thread) =>
          thread.environmentId === target.threadRef.environmentId &&
          thread.id === target.threadRef.threadId,
      );
      if (!thread) return false;
      const project = projects.find(
        (project) =>
          project.environmentId === target.threadRef.environmentId &&
          project.id === thread.projectId,
      );
      return (
        thread.archivedAt !== null ||
        thread.deletedAt !== null ||
        project?.agentProfile?.archived === true
      );
    });
    if (!archived.length) return;
    for (const tab of archived) forget(tab.target);
    const current = archived.find((tab) => tab.id === activeId);
    const viewingArchived =
      current?.target.kind === "server" &&
      (pathname ===
        `/${current.target.threadRef.environmentId}/${current.target.threadRef.threadId}` ||
        pathname ===
          `/${current.target.threadRef.environmentId}/${encodeURIComponent(current.target.threadRef.threadId)}`);
    if (viewingArchived) {
      const state = useConversationTabsStore.getState();
      const next = state.tabs.find((tab) => tab.id === state.activeId);
      if (next) void navigateTab(next.target, true);
      else void navigate({ to: "/", replace: true });
    }
  }, [pathname, projects, threads, tabs, activeId, forget, navigateTab, navigate]);
}

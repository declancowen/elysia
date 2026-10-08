import { WorkspaceSidebarContentHost } from "./WorkspaceSidebarContent";
import { PullRequestsHoverSidebar } from "../pullRequest/PullRequestsHoverSidebar";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  AuthOrchestrationOperateScope,
  type PageSummary,
  type PageSaveInput,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useAtomCommand } from "~/state/use-atom-command";
import { readEnvironmentScope, useEnvironmentScope } from "~/state/session";
import { applyWorkspaceBulkAction } from "../WorkspaceBulkActions";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { CollectionSidebarHeader } from "./CollectionSidebarHeader";
import { Button } from "../ui/button";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../ui/menu";
import { SidebarSectionHeader, useSidebarSectionExpansion } from "./SidebarSectionHeader";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { SettingsSidebarNav } from "../settings/SettingsSidebarNav";
import { useRegularProjects } from "~/hooks/useRegularProjects";
import { usePrimaryEnvironmentId, useEnvironments } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { useLegacySidebarEnabled } from "~/hooks/useSettings";
import { useConversationTabNavigation } from "~/hooks/useConversationTabNavigation";
import { useConversationRowClick } from "~/hooks/useConversationRowClick";
import { useConversationTabsStore, type ConversationTabTarget } from "~/conversationTabsStore";
import {
  Files01Icon,
  TaskEdit02Icon,
  FolderFileStorageIcon,
  PlusIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "~/icons";
import LegacySidebar from "../LegacySidebar";
import ThreadSidebar from "../Sidebar";
import { AgentsSidebar } from "../agents/AgentsSidebar";
import {
  groupPages,
  pageSelectionRoots,
  readPageDragIds,
  type PageGroup,
} from "../pages/PagesPage.logic";
import { groupTasks, visibleTasks, type TaskGroup } from "../tasks/taskViews";
import { useWorkspaceCollectionGrouping } from "../workspaceCollectionGrouping";
import { ScheduledTaskEnvironmentSection } from "../settings/ScheduledTasksSettings";
import { SettingsScopeProvider } from "../settings/SettingsScopeContext";
import { SettingsScopeSentence } from "../settings/SettingsScopeSentence";
import type { SettingsScopeSearch } from "../settings/settingsScope";
import {
  SidebarGroup,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "../ui/sidebar";
import { useSidebarHoverPreview, type SidebarHoverSection } from "./SidebarHoverPreview";

function CollectionRow({
  target,
  indent = 0,
  folder = false,
  actions,
  children,
  ...props
}: {
  folder?: boolean;
  indent?: number;
  actions?: ReactNode;
  target: Extract<ConversationTabTarget, { kind: "task" | "page" }>;
} & ComponentProps<"li">) {
  const navigate = useConversationTabNavigation();
  const open = (newTab = false) => {
    useConversationTabsStore.getState().open(target, newTab);
    void navigate(target);
  };
  const click = useConversationRowClick(
    () => open(),
    () => open(true),
  );
  return (
    <SidebarMenuItem {...props}>
      <div className={actions ? "pr-8" : undefined}>
        <SidebarMenuButton {...click}>
          {target.kind === "task" ? (
            <TaskEdit02Icon style={{ marginInlineStart: indent }} />
          ) : folder ? (
            <FolderFileStorageIcon />
          ) : (
            <Files01Icon />
          )}
          <span>{target.title}</span>
        </SidebarMenuButton>
      </div>
      {actions}
      {children}
    </SidebarMenuItem>
  );
}

function CollectionSection({
  id,
  label,
  indent = 0,
  children,
  ...props
}: {
  id: string;
  label: string | null;
  indent?: number;
  children: ReactNode;
} & ComponentProps<"section">) {
  const { expanded, setExpanded } = useSidebarSectionExpansion(`sidebar-collection:${id}`);
  return (
    <section
      {...props}
      onDragEnter={(event) => {
        props.onDragEnter?.(event);
        if (
          id.startsWith("pages:") &&
          event.dataTransfer.types.includes("application/elysia-pages")
        )
          setExpanded(true);
      }}
    >
      {label ? (
        <SidebarSectionHeader
          label={label}
          indent={indent}
          expanded={expanded}
          onToggle={() => setExpanded(!expanded)}
        />
      ) : null}
      {!label || expanded ? children : null}
    </section>
  );
}

export function CollectionSidebar({ kind }: { kind: "tasks" | "pages" }) {
  const environmentId = usePrimaryEnvironmentId();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<ReadonlySet<string>>(new Set());
  const folderHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moving = useRef(false);
  const canMovePages = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const savePage = useAtomCommand(serverEnvironment.savePage, {
    label: "sidebar page move",
    reportFailure: false,
  });
  const clearFolderHover = () => {
    if (folderHoverTimer.current) clearTimeout(folderHoverTimer.current);
    folderHoverTimer.current = null;
  };
  useEffect(
    () => () => {
      if (folderHoverTimer.current) clearTimeout(folderHoverTimer.current);
    },
    [],
  );
  const projects = useRegularProjects(false).filter(
    (project) => project.environmentId === environmentId,
  );
  const grouping = useWorkspaceCollectionGrouping();
  const tasksQuery = useEnvironmentQuery(
    environmentId && kind === "tasks"
      ? serverEnvironment.tasksLive({ environmentId, input: {} })
      : null,
  );
  const pagesQuery = useEnvironmentQuery(
    environmentId && kind === "pages"
      ? serverEnvironment.pagesLive({ environmentId, input: {} })
      : null,
  );
  const query = kind === "tasks" ? tasksQuery : pagesQuery;
  const taskRows = visibleTasks(tasksQuery.data?.tasks ?? [], {
    search,
    status: "",
    project: "",
    sort: "updated",
  });
  const taskGroups = groupTasks(taskRows, grouping.tasks, grouping.taskSubgroups, projects, true);
  const pageGroups = groupPages(pagesQuery.data?.pages ?? [], projects, {
    search,
    groupByProject: grouping.pages === "project",
    groupByType: grouping.pages === "type",
    subgroup: grouping.pageSubgroups,
    sort: "updated",
    hideEmpty: true,
  });
  const renderTaskGroup = (group: TaskGroup, level = 0) => (
    <div key={group.key}>
      <CollectionSection
        id={`tasks:${group.key}`}
        label={grouping.tasks !== "none" ? group.label : null}
        indent={level * 12}
      >
        {group.children.length ? (
          group.children.map((child) => renderTaskGroup(child, level + 1))
        ) : (
          <SidebarMenu>
            {environmentId
              ? group.tasks.map((task) => (
                  <CollectionRow
                    key={task.id}
                    indent={level * 12}
                    target={{ kind: "task", environmentId, id: task.id, title: task.title }}
                  />
                ))
              : null}
          </SidebarMenu>
        )}
      </CollectionSection>
    </div>
  );
  const allPages = pagesQuery.data?.pages ?? [];
  const childrenByFolder = new Map<string, PageSummary[]>();
  for (const page of allPages) {
    if (!page.parentFolderId) continue;
    const siblings = childrenByFolder.get(page.parentFolderId) ?? [];
    siblings.push(page);
    childrenByFolder.set(page.parentFolderId, siblings);
  }
  const pageDrop = (
    event: DragEvent,
    destination: Pick<PageSaveInput, "parentFolderId" | "projectId">,
  ) => {
    if (!event.dataTransfer.types.includes("application/elysia-pages")) return;
    event.preventDefault();
    event.stopPropagation();
    clearFolderHover();
    if (
      !environmentId ||
      moving.current ||
      !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)
    )
      return;
    try {
      const roots = pageSelectionRoots(
        allPages,
        new Set(readPageDragIds(event.dataTransfer.getData("application/elysia-pages"), allPages)),
      );
      moving.current = true;
      void applyWorkspaceBulkAction(roots, async (page) => {
        const result = await savePage({
          environmentId,
          input: { id: page.id, expectedRevision: page.revision, ...destination },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      })
        .then(({ failures }) => {
          if (failures.length)
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Could not move pages",
                description: failures.join("\n"),
              }),
            );
        })
        .finally(() => {
          moving.current = false;
        });
    } catch (error) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not move pages",
          description: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };
  const acceptPageDrag = (event: DragEvent) => {
    if (canMovePages && event.dataTransfer.types.includes("application/elysia-pages")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  };
  const renderPage = (page: PageSummary, ancestors: ReadonlySet<string> = new Set()): ReactNode => {
    if (!environmentId || ancestors.has(page.id)) return null;
    const folder = page.kind === "folder";
    const expanded = expandedFolders.has(page.id);
    const children = childrenByFolder.get(page.id) ?? [];
    return (
      <CollectionRow
        key={page.id}
        folder={folder}
        target={{ kind: "page", environmentId, id: page.id, title: page.title }}
        draggable={canMovePages}
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.setData("application/elysia-pages", JSON.stringify([page.id]));
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={clearFolderHover}
        onDragOver={folder ? acceptPageDrag : undefined}
        onDrop={folder ? (event) => pageDrop(event, { parentFolderId: page.id }) : undefined}
        onDragEnter={
          folder
            ? (event) => {
                if (
                  !canMovePages ||
                  !event.dataTransfer.types.includes("application/elysia-pages") ||
                  (event.relatedTarget instanceof Node &&
                    event.currentTarget.contains(event.relatedTarget))
                )
                  return;
                event.stopPropagation();
                clearFolderHover();
                folderHoverTimer.current = setTimeout(
                  () => setExpandedFolders((previous) => new Set([...previous, page.id])),
                  650,
                );
              }
            : undefined
        }
        onDragLeave={(event) => {
          if (
            !(
              event.relatedTarget instanceof Node &&
              event.currentTarget.contains(event.relatedTarget)
            )
          )
            clearFolderHover();
        }}
        actions={
          folder && children.length ? (
            <div className="absolute right-1 top-0">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${expanded ? "Collapse" : "Expand"} ${page.title}`}
                onClick={() =>
                  setExpandedFolders((previous) => {
                    const next = new Set(previous);
                    if (expanded) next.delete(page.id);
                    else next.add(page.id);
                    return next;
                  })
                }
              >
                {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
              </Button>
            </div>
          ) : null
        }
      >
        {folder && expanded ? (
          <div className="pl-3">
            <SidebarMenu>
              {children.map((child) => renderPage(child, new Set([...ancestors, page.id])))}
            </SidebarMenu>
          </div>
        ) : null}
      </CollectionRow>
    );
  };
  const renderPageGroup = (group: PageGroup, level = 0): ReactNode => {
    const ids = new Set(group.pages.map((page) => page.id));
    return (
      <div key={group.key} className={level ? "pl-3" : undefined}>
        <CollectionSection
          id={`pages:${group.key}`}
          label={group.title}
          onDragOver={group.projectId !== undefined ? acceptPageDrag : undefined}
          onDrop={
            group.projectId !== undefined
              ? (event) => pageDrop(event, { parentFolderId: null, projectId: group.projectId })
              : undefined
          }
        >
          {group.children.length ? (
            group.children.map((child) => renderPageGroup(child, level + 1))
          ) : (
            <SidebarMenu>
              {group.pages
                .filter((page) => !page.parentFolderId || !ids.has(page.parentFolderId))
                .map((page) => renderPage(page))}
            </SidebarMenu>
          )}
        </CollectionSection>
      </div>
    );
  };
  return (
    <>
      <CollectionSidebarHeader
        title={kind === "tasks" ? "Tasks" : "Pages"}
        query={search}
        onQueryChange={setSearch}
        actions={
          kind === "tasks" ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Create task"
              disabled={!environmentId}
              onClick={() => void navigate({ to: "/tasks", search: { create: true } })}
            >
              <PlusIcon />
            </Button>
          ) : (
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Create page or folder"
                    disabled={!environmentId}
                  />
                }
              >
                <PlusIcon />
              </MenuTrigger>
              <MenuPopup align="start">
                <MenuItem
                  onClick={() => void navigate({ to: "/pages", search: { create: "folder" } })}
                >
                  <FolderFileStorageIcon />
                  Folder
                </MenuItem>
                <MenuItem
                  onClick={() => void navigate({ to: "/pages", search: { create: "page" } })}
                >
                  <Files01Icon />
                  Page
                </MenuItem>
              </MenuPopup>
            </Menu>
          )
        }
      />
      <SidebarContent
        onDragOver={kind === "pages" ? acceptPageDrag : undefined}
        onDrop={kind === "pages" ? (event) => pageDrop(event, { parentFolderId: null }) : undefined}
      >
        <div className="space-y-4 p-2">
          {!environmentId ? (
            <p role="status" className="px-3 py-2 text-sm">
              Connect to an environment to see {kind}.
            </p>
          ) : query.error ? (
            <p role="status" className="px-3 py-2 text-sm">
              {query.error}
            </p>
          ) : !query.data ? (
            <p role="status" className="px-3 py-2 text-sm">
              Loading {kind}…
            </p>
          ) : kind === "tasks" ? (
            taskRows.length ? (
              taskGroups.map((group) => renderTaskGroup(group))
            ) : (
              <p className="px-3 py-2 text-sm text-sidebar-muted-foreground">No tasks yet.</p>
            )
          ) : pageGroups.some((group) => group.pages.length) ? (
            pageGroups.map((group) => renderPageGroup(group))
          ) : (
            <p className="px-3 py-2 text-sm text-sidebar-muted-foreground">No pages yet.</p>
          )}
        </div>
      </SidebarContent>
    </>
  );
}

function ScheduledSidebar() {
  const [scopeSearch, setScopeSearch] = useState<SettingsScopeSearch>({});
  const hover = useSidebarHoverPreview();
  const { environments } = useEnvironments();
  const navigate = useConversationTabNavigation();
  const [search, setSearch] = useState("");
  const environment = environments.find((entry) => entry.connection.phase === "connected");
  return (
    <SettingsScopeProvider search={scopeSearch} onChange={setScopeSearch}>
      <CollectionSidebarHeader
        title="Scheduled"
        query={search}
        onQueryChange={setSearch}
        actions={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Create scheduled task"
            disabled={!environment}
            onClick={() => {
              if (!environment) return;
              const target = {
                kind: "scheduled",
                selection: { kind: "task", environmentId: environment.environmentId, task: null },
              } as const;
              useConversationTabsStore.getState().open(target);
              void navigate(target);
              hover?.close();
            }}
          >
            <PlusIcon />
          </Button>
        }
      />
      <SidebarContent
        fixedHeader={
          <SidebarGroup>
            <SettingsScopeSentence compact />
          </SidebarGroup>
        }
      >
        {environments.map((environment) => (
          <ScheduledTaskEnvironmentSection
            key={environment.environmentId}
            environment={environment}
            showEnvironmentHeading={false}
            compact
            search={search}
            onEdit={(environmentId, task) => {
              const target = {
                kind: "scheduled",
                selection: { kind: "task", environmentId, task },
              } as const;
              useConversationTabsStore.getState().open(target);
              void navigate(target);
            }}
          />
        ))}
      </SidebarContent>
    </SettingsScopeProvider>
  );
}

export default function SidebarHoverContents({ section }: { section: SidebarHoverSection }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const projectSidebar = useLegacySidebarEnabled();
  if (section === "workspace")
    return projectSidebar ? <LegacySidebar preview /> : <ThreadSidebar preview />;
  if (section === "pull-requests")
    return pathname === "/pull-requests" ? (
      <WorkspaceSidebarContentHost floating />
    ) : (
      <PullRequestsHoverSidebar />
    );
  if (section === "projects") return <LegacySidebar preview projectsOnly />;
  if (section === "agents") return <AgentsSidebar preview />;
  if (section === "settings") return <SettingsSidebarNav pathname={pathname} preview />;
  if (section === "scheduled")
    return pathname === "/settings/scheduled-tasks" ? (
      <WorkspaceSidebarContentHost floating />
    ) : (
      <ScheduledSidebar />
    );
  return <CollectionSidebar kind={section} />;
}

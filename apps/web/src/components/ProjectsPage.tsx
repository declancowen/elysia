import {
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { openCommandPalette } from "../commandPaletteBus";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { useEscapeToGoBack } from "../hooks/useNavigateBack";
import { useScratchProject } from "../hooks/useScratchProject";
import { useThreadActions } from "../hooks/useThreadActions";
import {
  ArrowDownIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderClosedIcon,
  FolderOpenIcon,
  MessageCircle,
  MoreHorizontalIcon,
  Edit03Icon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from "../icons";
import { cn } from "../lib/utils";
import { readLocalApi } from "../localApi";
import type { SidebarProjectSnapshot } from "../sidebarProjectGrouping";
import {
  useAllEnvironmentProjectSnapshotsReady,
  useServerConfigs,
  useThreadShells,
} from "../state/entities";
import { buildThreadRouteParams } from "../threadRoutes";
import { formatRelativeTimeLabel } from "../timestampFormat";
import type { ThreadShell } from "../types";
import { buildProjectsPageRows, projectThreadUpdatedAt } from "./ProjectsPage.logic";
import { useSettingsProjectGroups } from "./settings/useSettingsProjectGroups";
import { Button } from "./ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "./ui/menu";
import { SidebarInset } from "./ui/sidebar";
import { Spinner } from "./ui/spinner";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { WorkspacePageContainer } from "./WorkspacePageContainer";

function reportProjectActionFailure(title: string, error: unknown) {
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description: error instanceof Error ? error.message : "An error occurred.",
    }),
  );
}

export function ProjectsPage() {
  useEscapeToGoBack();
  const groups = useSettingsProjectGroups();
  const threads = useThreadShells();
  const projectsReady = useAllEnvironmentProjectSnapshotsReady();
  const serverConfigs = useServerConfigs();
  const { scratchWorkspaceRootFor } = useScratchProject();
  const handleNewThread = useNewThreadHandler();
  const { pinThread, unpinThread } = useThreadActions();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pendingPin, setPendingPin] = useState<string | null>(null);
  const rows = useMemo(
    () => buildProjectsPageRows(groups, threads, search, scratchWorkspaceRootFor),
    [groups, threads, search, scratchWorkspaceRootFor],
  );

  const newChat = (project: SidebarProjectSnapshot) => {
    void handleNewThread(scopeProjectRef(project.environmentId, project.id)).catch(
      (error: unknown) => reportProjectActionFailure("Could not create chat", error),
    );
  };
  const openProject = (project: SidebarProjectSnapshot) => {
    void navigate({ to: "/projects/$projectKey", params: { projectKey: project.projectKey } });
  };
  const togglePin = async (thread: ThreadShell) => {
    const ref = scopeThreadRef(thread.environmentId, thread.id);
    setPendingPin(scopedThreadKey(ref));
    try {
      const result = await (thread.pinnedAt == null ? pinThread(ref) : unpinThread(ref));
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        reportProjectActionFailure("Could not update chat pin", squashAtomCommandFailure(result));
      }
    } catch (error) {
      reportProjectActionFailure("Could not update chat pin", error);
    } finally {
      setPendingPin(null);
    }
  };
  const projectContextMenu = async (
    project: SidebarProjectSnapshot,
    position: { x: number; y: number },
  ) => {
    try {
      const action = await readLocalApi()?.contextMenu.show(
        [
          { id: "new-chat", label: "New chat" },
          { id: "settings", label: "Project settings" },
        ],
        position,
      );
      if (action === "new-chat") newChat(project);
      if (action === "settings") openProject(project);
    } catch (error) {
      reportProjectActionFailure("Could not open project actions", error);
    }
  };

  return (
    <SidebarInset variant="standalone" className="min-h-0 overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <WorkspacePageContainer width="surface">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="pl-3 text-xl font-medium">Projects</h1>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="w-60 max-w-full">
                <InputGroup variant="filled">
                  <InputGroupAddon>
                    <SearchIcon className="size-4" />
                  </InputGroupAddon>
                  <InputGroupInput
                    type="search"
                    placeholder="Search projects"
                    aria-label="Search projects"
                    value={search}
                    onValueChange={setSearch}
                  />
                </InputGroup>
              </div>
              <Button onClick={() => openCommandPalette({ open: "add-project" })}>
                <PlusIcon />
                Create project
              </Button>
            </div>
          </div>
          <div>
            <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-3 px-3 pb-3 text-xs text-muted-foreground sm:grid-cols-[minmax(0,1fr)_6rem_5.5rem]">
              <span>Name</span>
              <span className="inline-flex items-center gap-1">
                Updated <ArrowDownIcon className="size-3" />
              </span>
            </div>
            {!projectsReady && rows.length === 0 ? (
              <div
                role="status"
                className="flex items-center gap-2 px-3 py-5 text-sm text-muted-foreground"
              >
                <Spinner size="sm" />
                Loading projects…
              </div>
            ) : rows.length === 0 ? (
              <p className="px-3 py-5 text-sm text-muted-foreground">
                {search.trim() ? "No matching projects." : "No projects yet."}
              </p>
            ) : (
              rows.map(({ project, threads: projectThreads, updatedAt }, index) => {
                const isExpanded = expanded[project.projectKey] ?? index === 0;
                const updatedDate = Number.isFinite(updatedAt)
                  ? new Date(updatedAt).toISOString()
                  : project.updatedAt;
                return (
                  <section key={project.projectKey} className="border-b border-border/60 py-2">
                    <div
                      className={cn(
                        "grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-3 rounded-xl px-3 py-3 sm:grid-cols-[minmax(0,1fr)_6rem_5.5rem]",
                        isExpanded && "bg-secondary",
                      )}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        void projectContextMenu(project, { x: event.clientX, y: event.clientY });
                      }}
                    >
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? "Collapse" : "Expand"} ${project.displayName}`}
                        onClick={() =>
                          setExpanded((previous) => ({
                            ...previous,
                            [project.projectKey]: !isExpanded,
                          }))
                        }
                        className="flex min-w-0 cursor-pointer items-center gap-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {isExpanded ? (
                          <FolderOpenIcon className="size-4 shrink-0" />
                        ) : (
                          <FolderClosedIcon className="size-4 shrink-0" />
                        )}
                        <span className="truncate">{project.displayName}</span>
                        {isExpanded ? (
                          <ChevronDownIcon className="size-3 shrink-0" />
                        ) : (
                          <ChevronRightIcon className="size-3 shrink-0" />
                        )}
                      </button>
                      <time className="text-xs text-muted-foreground" dateTime={updatedDate}>
                        {formatRelativeTimeLabel(updatedDate)}
                      </time>
                      <div className="flex items-center justify-end gap-1">
                        <Menu>
                          <MenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Actions for ${project.displayName}`}
                              />
                            }
                          >
                            <MoreHorizontalIcon />
                          </MenuTrigger>
                          <MenuPopup align="end">
                            <MenuItem onClick={() => newChat(project)}>
                              <Edit03Icon />
                              New chat
                            </MenuItem>
                            <MenuItem onClick={() => openProject(project)}>
                              <SettingsIcon />
                              Project settings
                            </MenuItem>
                          </MenuPopup>
                        </Menu>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`New chat in ${project.displayName}`}
                          onClick={() => newChat(project)}
                        >
                          <Edit03Icon />
                        </Button>
                      </div>
                    </div>
                    {isExpanded ? (
                      <div className="pt-1 pb-2">
                        {projectThreads.length === 0 ? (
                          <p className="px-10 py-2 text-sm text-muted-foreground">
                            No threads yet.
                          </p>
                        ) : (
                          projectThreads.map((thread) => {
                            const threadRef = scopeThreadRef(thread.environmentId, thread.id);
                            const threadUpdatedAt = projectThreadUpdatedAt(thread);
                            return (
                              <div
                                key={scopedThreadKey(threadRef)}
                                className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-3 rounded-lg px-3 py-1 sm:grid-cols-[minmax(0,1fr)_6rem_5.5rem] hover:bg-secondary/50"
                              >
                                <Link
                                  to="/$environmentId/$threadId"
                                  params={buildThreadRouteParams(threadRef)}
                                  className="flex min-w-0 items-center gap-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  <MessageCircle className="size-4 shrink-0 text-muted-foreground" />
                                  <span className="truncate">{thread.title}</span>
                                </Link>
                                <time
                                  className="text-xs text-muted-foreground"
                                  dateTime={threadUpdatedAt}
                                >
                                  {formatRelativeTimeLabel(threadUpdatedAt)}
                                </time>
                                <div className="flex justify-end">
                                  {serverConfigs.get(thread.environmentId)?.environment.capabilities
                                    .threadPinning ? (
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      aria-label={`${thread.pinnedAt == null ? "Pin" : "Unpin"} ${thread.title}`}
                                      disabled={pendingPin !== null}
                                      onClick={() => void togglePin(thread)}
                                    >
                                      {thread.pinnedAt == null ? <PinIcon /> : <PinOffIcon />}
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </section>
                );
              })
            )}
          </div>
        </WorkspacePageContainer>
      </div>
    </SidebarInset>
  );
}

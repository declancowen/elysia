import { formatComposerContextReference } from "@t3tools/shared/composerContextReferences";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { formatCalendarDate } from "@t3tools/shared/dateFormat";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useRef, useState, useEffect, type DragEvent, type ReactNode } from "react";
import {
  ComposerContextId,
  ProjectId,
  PageId,
  type PageSaveInput,
  type PageSummary,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useRegularProjects } from "../../hooks/useRegularProjects";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  CopyIcon,
  ChannelIcon as HashIcon,
  Trash2Icon,
  Edit03Icon,
  ExternalLinkIcon,
  ArrowUpDownIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  Files01Icon,
  FolderClosedIcon,
  FolderFileStorageIcon,
  Columns2Icon,
  PlusIcon,
  SearchIcon,
  MoreHorizontalIcon,
  SlidersHorizontalIcon,
} from "../../icons";
import { useConversationTabNavigation } from "../../hooks/useConversationTabNavigation";
import { useConversationTabsStore } from "../../conversationTabsStore";
import { WorkspaceItemTabs } from "../WorkspaceItemTabs";
import { WorkspaceItemLink } from "../WorkspaceItemLink";
import { PagesPageItemRow } from "./PagesPageItemRow";
import { WorkspaceSurfaceHeader } from "../WorkspaceSurfaceHeader";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { applyWorkspaceBulkAction } from "../WorkspaceBulkActions";
import { Button } from "../ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "../ui/empty";
import { Input } from "../ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import {
  Menu,
  MenuTrigger,
  MenuItem,
  MenuPopup,
  MenuGroup,
  MenuGroupLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuCheckboxItem,
  MenuSeparator,
  MenuSub,
  MenuSubTrigger,
  MenuSubPopup,
} from "../ui/menu";
import { SidebarInset, useSidebar } from "../ui/sidebar";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { useWorkspaceCollectionGrouping } from "../workspaceCollectionGrouping";
import {
  groupPages,
  pageTreeRows,
  pageSelectionRoots,
  pageCardGeometry,
  readPageDragIds,
  pageMoveDestinations,
  pageFolderGrouping,
  type PageGroup,
} from "./PagesPage.logic";
import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import {
  CollectionGroups,
  CollectionRows,
  CollectionViewPicker,
  CollectionPropertyPill,
  CollectionPropertiesPicker,
  CollectionTableCell,
  CollectionCardSizePicker,
  CARD_WIDTHS,
  type CollectionCardSize,
  type CollectionProperty,
  type CollectionView,
} from "../WorkspaceCollectionView";
import { ensureLocalApi } from "../../localApi";
import { showContextMenuFallback } from "../../contextMenuFallback";
import { cn } from "../../lib/utils";

const PAGE_PROPERTIES = [
  { id: "project", label: "Project" },
  { id: "createdAt", label: "Created at" },
  { id: "updatedAt", label: "Edited at" },
] as const;

export function PagesPage({ folderId = null }: { folderId?: PageId | null }) {
  const { open: sidebarOpen } = useSidebar();
  const environmentId = usePrimaryEnvironmentId();
  const query = useEnvironmentQuery(
    environmentId ? serverEnvironment.pagesLive({ environmentId, input: {} }) : null,
  );
  const regularProjects = useRegularProjects(false);
  const projects = regularProjects.filter((project) => project.environmentId === environmentId);
  const savePage = useAtomCommand(serverEnvironment.savePage);
  const deletePage = useAtomCommand(serverEnvironment.deletePage);
  const navigate = useNavigate();
  const navigateTab = useConversationTabNavigation();
  const [search, setSearch] = useState("");
  const view = useWorkspaceCollectionGrouping((state) => state.pageView);
  const setView = (pageView: CollectionView) =>
    useWorkspaceCollectionGrouping.setState({ pageView });
  const cardSize = useWorkspaceCollectionGrouping((state) => state.pageCardSize);
  const setCardSize = (pageCardSize: CollectionCardSize) =>
    useWorkspaceCollectionGrouping.setState({ pageCardSize });
  const [currentFolderId, setCurrentFolderId] = useState(folderId);
  const [createKind, setCreateKind] = useState<"page" | "folder">("page");
  const [createParent, setCreateParent] = useState<string>(folderId ?? "none");
  const folderHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (folderHoverTimer.current) clearTimeout(folderHoverTimer.current);
    },
    [],
  );
  const properties = useWorkspaceCollectionGrouping((state) => state.pageProperties);
  const setProperties = (pageProperties: CollectionProperty[]) =>
    useWorkspaceCollectionGrouping.setState({ pageProperties });
  const subGrouping = useWorkspaceCollectionGrouping((state) => state.pageSubgroups);
  const setSubGrouping = (pageSubgroups: "project" | "type" | "none") =>
    useWorkspaceCollectionGrouping.setState({ pageSubgroups });
  const grouping = useWorkspaceCollectionGrouping((state) => state.pages);
  const setGrouping = (pages: "project" | "type" | "none") =>
    useWorkspaceCollectionGrouping.setState({ pages });
  const groupDescending = useWorkspaceCollectionGrouping((state) => state.pageGroupDescending);
  const setGroupDescending = (pageGroupDescending: boolean) =>
    useWorkspaceCollectionGrouping.setState({ pageGroupDescending });
  const hideEmpty = useWorkspaceCollectionGrouping((state) => state.pageHideEmpty);
  const setHideEmpty = (pageHideEmpty: boolean) =>
    useWorkspaceCollectionGrouping.setState({ pageHideEmpty });
  const [expandedFolders, setExpandedFolders] = useState<Set<PageId>>(new Set());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const sort = useWorkspaceCollectionGrouping((state) => state.pageSort);
  const setSort = (pageSort: "updated" | "created" | "title") =>
    useWorkspaceCollectionGrouping.setState({ pageSort });
  const [renaming, setRenaming] = useState<PageSummary | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { create: requestedCreate } = useSearch({ from: "/pages" });
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("none");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const { copyToClipboard } = useCopyToClipboard({ onError: (error) => setError(error.message) });
  const [selection, setSelection] = useState<Set<PageId>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [movingIds, setMovingIds] = useState<readonly PageId[] | null>(null);
  const [moveDestination, setMoveDestination] = useState<string>("none");
  const allPages = query.data?.pages ?? [];
  const folders = allPages.filter((page) => page.kind === "folder");
  const currentFolder = folders.find((page) => page.id === currentFolderId);
  const { grouping: effectiveGrouping, subgroup: effectiveSubGrouping } = pageFolderGrouping(
    grouping,
    subGrouping,
    currentFolder?.projectId,
  );
  const groupByProject = effectiveGrouping === "project";
  const propertyColumns = PAGE_PROPERTIES.filter(
    (property) =>
      properties.includes(property.id) &&
      (property.id !== "project" ||
        (effectiveGrouping !== "project" &&
          effectiveSubGrouping !== "project" &&
          !currentFolder?.projectId)),
  );
  const breadcrumbs: PageSummary[] = [];
  for (
    let folder = currentFolder;
    folder && !breadcrumbs.some((entry) => entry.id === folder!.id);
    folder = folders.find((entry) => entry.id === folder?.parentFolderId)
  )
    breadcrumbs.unshift(folder);
  const shownPages = allPages.filter(
    (page) => search.trim() || (page.parentFolderId ?? null) === currentFolderId,
  );
  const groups = groupPages(shownPages, projects, {
    search,
    groupByProject: effectiveGrouping === "project",
    groupByType: effectiveGrouping === "type",
    includeNested: currentFolderId !== null,
    subgroup: effectiveSubGrouping,
    sort,
    groupDescending,
    hideEmpty,
  });
  const { folderHeight } = pageCardGeometry(propertyColumns.length, false);
  const openPage = (page: PageSummary, newTab = false) => {
    if (!environmentId) return;
    const target = {
      kind: "page" as const,
      environmentId: environmentId,
      id: page.id,
      title: page.title,
    };
    useConversationTabsStore.getState().open(target, newTab);
    void navigateTab(target);
  };
  const updatePage = async (input: PageSaveInput) => {
    if (!environmentId) return;
    setError(null);
    const result = await savePage({ environmentId, input });
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  };
  const moveItems = async (
    ids: readonly PageId[],
    parentFolderId: PageId | null,
    projectId?: ProjectId | null,
  ) => {
    if (bulkPending) return false;
    setBulkPending(true);
    setError(null);
    const roots = pageSelectionRoots(allPages, new Set(ids));
    const { failures } = await applyWorkspaceBulkAction(roots, (row) =>
      updatePage({
        id: row.id,
        expectedRevision: row.revision,
        parentFolderId,
        ...(projectId !== undefined ? { projectId } : {}),
      }),
    );
    setBulkPending(false);
    if (failures.length) setError(failures.join("\n"));
    return failures.length === 0;
  };
  const dropIntoFolder = (event: DragEvent, parent: PageId | null) => {
    if (!event.dataTransfer.types.includes("application/elysia-pages")) return;
    event.preventDefault();
    event.stopPropagation();
    if (folderHoverTimer.current) clearTimeout(folderHoverTimer.current);
    try {
      void moveItems(
        readPageDragIds(event.dataTransfer.getData("application/elysia-pages"), allPages),
        parent,
      ).catch((cause) => setError(String(cause)));
    } catch (cause) {
      setError(String(cause));
    }
  };
  const dropIntoProject = (event: DragEvent, projectId: ProjectId | null) => {
    if (!event.dataTransfer.types.includes("application/elysia-pages")) return;
    event.preventDefault();
    event.stopPropagation();
    if (folderHoverTimer.current) clearTimeout(folderHoverTimer.current);
    try {
      void moveItems(
        readPageDragIds(event.dataTransfer.getData("application/elysia-pages"), allPages),
        null,
        projectId,
      ).catch((cause) => setError(String(cause)));
    } catch (cause) {
      setError(String(cause));
    }
  };
  const runSelectionAction = async (
    page: PageSummary,
    action: string,
    selectedIds?: ReadonlySet<PageId>,
  ) => {
    if (!environmentId || bulkPending) return;
    const ids = selectedIds ?? (selection.has(page.id) ? selection : new Set([page.id]));
    setSelection(new Set(ids));
    const selectedPages = allPages.filter((row) => ids.has(row.id));
    if (action === "rename") {
      setRenaming(page);
      setTitle(page.title);
      setProjectId(page.projectId ?? "none");
      setCreateParent(page.parentFolderId ?? "none");
      setCreateKind(page.kind ?? "page");
      setCreateOpen(true);
      return;
    }
    if (action === "move") {
      setMoveDestination("none");
      setMovingIds([...ids]);
      setError(null);
      return;
    }
    if (action === "open") {
      openPage(page);
      return;
    }
    if (action === "copy-id" || action === "copy-reference") {
      copyToClipboard(
        selectedPages
          .map((row) =>
            action === "copy-id"
              ? row.id
              : formatComposerContextReference({
                  kind: "page",
                  contextId: ComposerContextId.make(row.id),
                  label: row.title,
                }),
          )
          .join("\n"),
        undefined,
      );
      return;
    }
    if (action === "open-new-tab") {
      openPage(page, true);
      return;
    }
    if (
      action === "delete" &&
      !(await ensureLocalApi().dialogs.confirm(
        `Permanently delete ${selectedPages.length} selected items? Folders include all descendant pages and folders. This cannot be undone.`,
        { variant: "destructive" },
      ))
    )
      return;
    if (action !== "delete" && !action.startsWith("project:")) return;
    setBulkPending(true);
    setError(null);
    const { completed, failures } = await applyWorkspaceBulkAction(
      pageSelectionRoots(allPages, ids),
      async (row) => {
        const result =
          action === "delete"
            ? await deletePage({ environmentId, input: { id: row.id } })
            : await savePage({
                environmentId,
                input: {
                  id: row.id,
                  expectedRevision: row.revision,
                  projectId: action === "project:none" ? null : ProjectId.make(action.slice(8)),
                },
              });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      },
    );
    setSelection(
      new Set(
        pageSelectionRoots(allPages, ids)
          .filter((row) => !completed.has(row.id))
          .map((row) => row.id),
      ),
    );
    setBulkPending(false);
    if (failures.length) setError(failures.join("\n"));
  };
  const showSelectionMenu = async (page: PageSummary, position: { x: number; y: number }) => {
    if (!environmentId || bulkPending) return;
    const ids = selection.has(page.id) ? selection : new Set([page.id]);
    setSelection(new Set(ids));
    const selectedPages = allPages.filter((row) => ids.has(row.id));
    const action = await showContextMenuFallback(
      [
        {
          id: "open",
          label: "Open",
          icon: page.kind === "folder" ? "workspace-folder" : "workspace-page",
        },
        { id: "open-new-tab", label: "Open in new tab", icon: "open-new-tab" },
        { id: "copy-id", label: "Copy ID", icon: "hash" },
        { id: "copy-reference", label: "Copy reference", icon: "copy" },
        { id: "rename", label: "Rename", icon: "edit-03" },
        { id: "move", label: "Move", icon: "workspace-folder" },
        {
          id: "project",
          label: "Change project",
          icon: "workspace-project",
          children: [
            { id: "project:none", label: "No Project", icon: "workspace-project" },
            ...projects.map((project) => ({
              id: `project:${project.id}`,
              label: project.title,
              icon: "workspace-project",
            })),
          ],
        },
        {
          id: "delete",
          label: `Delete (${selectedPages.length})`,
          destructive: true,
          icon: "workspace-delete",
        },
      ],
      position,
    );
    if (action) await runSelectionAction(page, action, ids);
  };
  const startCreate = (kind: "page" | "folder") => {
    setError(null);
    setRenaming(null);
    setTitle("");
    setCreateKind(kind);
    setCreateParent(currentFolderId ?? "none");
    setProjectId(currentFolder?.projectId ?? "none");
    setCreateOpen(true);
  };
  useEffect(() => {
    if (!requestedCreate) return;
    setError(null);
    setRenaming(null);
    setTitle("");
    setCreateKind(requestedCreate);
    setCreateParent(currentFolderId ?? "none");
    setProjectId(currentFolder?.projectId ?? "none");
    setCreateOpen(true);
    void navigate({ to: "/pages", search: {}, replace: true });
  }, [requestedCreate, navigate, currentFolderId, currentFolder?.projectId]);
  const create = async () => {
    if (!environmentId || !title.trim() || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    const result = await savePage({
      environmentId,
      input: {
        ...(renaming ? { id: renaming.id, expectedRevision: renaming.revision } : {}),
        title: title.trim(),
        kind: createKind,
        parentFolderId: createParent === "none" ? null : PageId.make(createParent),
        projectId: projectId === "none" ? null : ProjectId.make(projectId),
      },
    });
    submitting.current = false;
    setSaving(false);
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) setError(String(squashAtomCommandFailure(result)));
      return;
    }
    setCreateOpen(false);
    setTitle("");
    if (renaming) {
      setRenaming(null);
      return;
    }
    void navigate({
      to: "/pages/$pageId",
      params: { pageId: result.value.page.id },
    });
  };
  const renderGroup = (group: PageGroup): ReactNode => (
    <section
      key={group.key}
      onDragOver={(event) => {
        if (
          group.projectId !== undefined &&
          event.dataTransfer.types.includes("application/elysia-pages")
        ) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(event) => {
        if (group.projectId !== undefined) dropIntoProject(event, group.projectId);
        else if (group.key.endsWith("type:page") || group.key.endsWith("type:folder")) {
          // Type is a grouping choice, not an instruction to convert a page or folder.
          event.stopPropagation();
          if (folderHoverTimer.current) clearTimeout(folderHoverTimer.current);
        }
      }}
      className={cn("min-w-0 space-y-3", view === "board" && "shrink-0")}
      style={
        view === "board" && !group.children.length ? { width: CARD_WIDTHS[cardSize] } : undefined
      }
    >
      {group.title ? (
        <h2>
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-3 rounded-md bg-muted/20 px-3 py-2 text-left text-sm text-muted-foreground outline-none ring-1 ring-inset ring-border/60 hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={!collapsed[group.key]}
            onClick={() =>
              setCollapsed((current) => ({
                ...current,
                [group.key]: !current[group.key],
              }))
            }
          >
            {collapsed[group.key] ? (
              <ChevronRightIcon className="size-4" />
            ) : (
              <ChevronDownIcon className="size-4" />
            )}
            {group.key.endsWith("type:folder") ? (
              <FolderFileStorageIcon className="size-4 shrink-0" />
            ) : group.key.endsWith("type:page") ? (
              <FileTextIcon className="size-4 shrink-0" />
            ) : (
              <FolderClosedIcon className="size-4 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{group.title}</span>
            <span className="text-xs">{group.pages.length}</span>
          </button>
        </h2>
      ) : null}
      {!collapsed[group.key] && group.children.length ? (
        <div className={cn("gap-4", view === "board" ? "flex items-start" : "flex flex-col")}>
          {group.children.map(renderGroup)}
        </div>
      ) : null}
      {!collapsed[group.key] && !group.children.length ? (
        <CollectionRows
          view={view}
          header={false}
          cardSize={cardSize}
          folderHeight={folderHeight}
          wallColumns={sidebarOpen ? 4 : 5}
          label="Pages"
          columns={[
            { id: "title", label: "Title" },
            ...propertyColumns,
            { id: "actions", label: "Actions" },
          ]}
        >
          {pageTreeRows(
            group.pages,
            allPages,
            view === "list" || view === "table" ? expandedFolders : new Set(),
            sort,
          ).map(({ page, depth }) => {
            const selectionControl = (
              <div
                className={cn(
                  "flex shrink-0 items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100",
                  selection.has(page.id) && "opacity-100",
                )}
              >
                <Checkbox
                  aria-label={`Select ${page.title}`}
                  checked={selection.has(page.id)}
                  disabled={bulkPending}
                  onCheckedChange={(checked) =>
                    setSelection((current) => {
                      const next = new Set(current);
                      if (checked) next.add(page.id);
                      else next.delete(page.id);
                      return next;
                    })
                  }
                />
              </div>
            );
            return (
              <PagesPageItemRow
                key={page.id}
                onOpen={(newTab) => openPage(page, newTab)}
                style={
                  view === "list" || view === "table"
                    ? { paddingInlineStart: 12 + depth * 24 }
                    : {
                        height:
                          page.kind === "folder" && view !== "wall"
                            ? folderHeight
                            : view === "card"
                              ? pageCardGeometry(
                                  propertyColumns.length,
                                  Boolean(page.contentPreview),
                                ).pageHeight
                              : undefined,
                        minHeight:
                          page.kind === "folder" && view === "wall"
                            ? propertyColumns.length
                              ? 88
                              : 52
                            : view === "wall"
                              ? 160
                              : undefined,
                        maxHeight: view === "wall" && page.kind !== "folder" ? 432 : undefined,
                        gridRow:
                          view === "card" && page.kind !== "folder"
                            ? `span ${pageCardGeometry(propertyColumns.length, Boolean(page.contentPreview)).pageRows}`
                            : undefined,
                      }
                }
                role={view === "table" ? "row" : undefined}
                draggable={!bulkPending}
                onDragStart={(event) => {
                  event.stopPropagation();
                  const rowBounds = event.currentTarget.getBoundingClientRect();
                  event.dataTransfer.setDragImage(
                    event.currentTarget,
                    event.clientX - rowBounds.left,
                    event.clientY - rowBounds.top,
                  );
                  const ids = selection.has(page.id) ? [...selection] : [page.id];
                  event.dataTransfer.setData("application/elysia-pages", JSON.stringify(ids));
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={page.kind === "folder" ? (event) => event.preventDefault() : undefined}
                onDragEnter={
                  page.kind === "folder"
                    ? (event) => {
                        if (!event.dataTransfer.types.includes("application/elysia-pages")) return;
                        if (
                          event.relatedTarget instanceof Node &&
                          event.currentTarget.contains(event.relatedTarget)
                        )
                          return;
                        if (folderHoverTimer.current) clearTimeout(folderHoverTimer.current);
                        folderHoverTimer.current = setTimeout(() => {
                          setCurrentFolderId(page.id);
                        }, 650);
                      }
                    : undefined
                }
                onDragLeave={(event) => {
                  if (
                    event.relatedTarget instanceof Node &&
                    event.currentTarget.contains(event.relatedTarget)
                  )
                    return;
                  if (folderHoverTimer.current) clearTimeout(folderHoverTimer.current);
                }}
                onDrop={
                  page.kind === "folder" ? (event) => dropIntoFolder(event, page.id) : undefined
                }
                onContextMenu={(event) => {
                  event.preventDefault();
                  void showSelectionMenu(page, {
                    x: event.clientX,
                    y: event.clientY,
                  }).catch((error) => setError(String(error)));
                }}
                className={cn(
                  "group relative min-w-0 cursor-pointer gap-3 rounded-lg hover:bg-sidebar-row-hover",
                  view === "list"
                    ? "flex items-center px-3"
                    : view === "table"
                      ? "grid grid-cols-[var(--collection-columns)] items-center rounded-none border-b border-border px-3"
                      : "flex flex-col border border-border bg-card p-4",
                  selection.has(page.id) && "bg-sidebar-row-selected",
                )}
              >
                {view === "list" ? selectionControl : null}
                <CollectionTableCell view={view} align="left">
                  <div
                    className={cn(
                      "flex min-w-0 flex-1 gap-2",
                      view === "list" || view === "table"
                        ? "items-center"
                        : "min-h-0 items-start overflow-hidden",
                    )}
                  >
                    {page.kind === "folder" && (view === "list" || view === "table") ? (
                      <button
                        type="button"
                        aria-label={`Expand ${page.title}`}
                        aria-expanded={expandedFolders.has(page.id)}
                        className="cursor-pointer p-1"
                        onClick={() =>
                          setExpandedFolders((current) => {
                            const next = new Set(current);
                            if (next.has(page.id)) next.delete(page.id);
                            else next.add(page.id);
                            return next;
                          })
                        }
                      >
                        {expandedFolders.has(page.id) ? (
                          <ChevronDownIcon className="size-4" />
                        ) : (
                          <ChevronRightIcon className="size-4" />
                        )}
                      </button>
                    ) : null}
                    <WorkspaceItemLink
                      onOpen={(newTab) => openPage(page, newTab)}
                      className={cn(
                        "flex min-w-0 flex-1 gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        view === "list" || view === "table"
                          ? "items-center py-3"
                          : "h-full flex-col items-stretch justify-start pr-16",
                      )}
                    >
                      <span className="flex min-w-0 items-start gap-3 leading-5 [&>svg]:mt-0.5">
                        {page.kind === "folder" ? (
                          <FolderFileStorageIcon className="size-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span
                          className={
                            view === "list" || view === "table"
                              ? "min-w-0 flex-1 truncate text-sm"
                              : page.kind === "folder" && view !== "wall"
                                ? "min-w-0 truncate text-sm font-medium leading-5"
                                : "line-clamp-2 text-sm font-medium leading-5"
                          }
                        >
                          {page.title}
                        </span>
                      </span>
                      {(view === "card" || view === "wall") &&
                      page.kind !== "folder" &&
                      page.contentPreview ? (
                        <span className="line-clamp-6 text-sm text-muted-foreground">
                          {
                            new DOMParser().parseFromString(page.contentPreview, "text/html").body
                              .textContent
                          }
                        </span>
                      ) : null}
                    </WorkspaceItemLink>
                  </div>
                </CollectionTableCell>
                {propertyColumns.length ? (
                  <div
                    className={
                      view === "table"
                        ? "contents"
                        : view === "list"
                          ? "flex flex-wrap justify-end gap-2"
                          : "mt-auto flex shrink-0 flex-wrap justify-start gap-2"
                    }
                  >
                    {propertyColumns.map(({ id: kind, label }) => (
                      <CollectionTableCell key={kind} view={view}>
                        {kind !== "project" ? (
                          <Badge variant="outline" title={label}>
                            {formatCalendarDate(page[kind])}
                          </Badge>
                        ) : (
                          <CollectionPropertyPill
                            label={`Change project for ${page.title}`}
                            value={page.projectId ?? "none"}
                            options={[
                              { value: "none", label: "No Project" },
                              ...projects.map((project) => ({
                                value: project.id,
                                label: project.title,
                              })),
                            ]}
                            disabled={
                              bulkPending ||
                              !environmentId ||
                              Boolean(
                                page.parentFolderId &&
                                folders.find((folder) => folder.id === page.parentFolderId)
                                  ?.projectId,
                              )
                            }
                            onChange={(value) => {
                              if (!environmentId) return;
                              setError(null);
                              void savePage({
                                environmentId,
                                input: {
                                  id: page.id,
                                  expectedRevision: page.revision,
                                  projectId: value === "none" ? null : ProjectId.make(value),
                                },
                              })
                                .then((result) => {
                                  if (result._tag === "Failure")
                                    setError(String(squashAtomCommandFailure(result)));
                                })
                                .catch((error) => setError(String(error)));
                            }}
                          >
                            {projects.find((project) => project.id === page.projectId)?.title ??
                              "No Project"}
                          </CollectionPropertyPill>
                        )}
                      </CollectionTableCell>
                    ))}
                  </div>
                ) : null}
                <CollectionTableCell view={view}>
                  <div
                    className={cn(
                      "flex shrink-0 items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100",
                      selection.has(page.id) && "opacity-100",
                      (view === "card" || view === "board" || view === "wall") &&
                        "absolute top-3 right-3",
                    )}
                  >
                    {view !== "list" ? selectionControl : null}
                    <Menu>
                      <MenuTrigger
                        render={
                          <Button
                            variant="ghost-muted"
                            size="icon-xs"
                            aria-label={`Options for ${page.title}`}
                          />
                        }
                      >
                        <MoreHorizontalIcon />
                      </MenuTrigger>
                      <MenuPopup>
                        <MenuItem
                          onClick={() =>
                            void runSelectionAction(page, "open").catch((cause) =>
                              setError(String(cause)),
                            )
                          }
                        >
                          {page.kind === "folder" ? <FolderFileStorageIcon /> : <Files01Icon />}
                          Open
                        </MenuItem>
                        <MenuItem
                          onClick={() =>
                            void runSelectionAction(page, "open-new-tab").catch((cause) =>
                              setError(String(cause)),
                            )
                          }
                        >
                          <ExternalLinkIcon />
                          Open in new tab
                        </MenuItem>
                        <MenuItem
                          onClick={() =>
                            void runSelectionAction(page, "copy-id").catch((cause) =>
                              setError(String(cause)),
                            )
                          }
                        >
                          <HashIcon />
                          Copy ID
                        </MenuItem>
                        <MenuItem
                          onClick={() =>
                            void runSelectionAction(page, "copy-reference").catch((cause) =>
                              setError(String(cause)),
                            )
                          }
                        >
                          <CopyIcon />
                          Copy reference
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem
                          onClick={() =>
                            void runSelectionAction(page, "rename").catch((cause) =>
                              setError(String(cause)),
                            )
                          }
                        >
                          <Edit03Icon />
                          Rename
                        </MenuItem>
                        <MenuItem
                          onClick={() =>
                            void runSelectionAction(page, "move").catch((cause) =>
                              setError(String(cause)),
                            )
                          }
                        >
                          <FolderFileStorageIcon />
                          Move
                        </MenuItem>
                        <MenuSub>
                          <MenuSubTrigger>
                            <FolderClosedIcon />
                            Change project
                          </MenuSubTrigger>
                          <MenuSubPopup>
                            <MenuItem
                              onClick={() =>
                                void runSelectionAction(page, "project:none").catch((cause) =>
                                  setError(String(cause)),
                                )
                              }
                            >
                              <FolderClosedIcon />
                              No Project
                            </MenuItem>
                            {projects.map((project) => (
                              <MenuItem
                                key={project.id}
                                onClick={() =>
                                  void runSelectionAction(page, `project:${project.id}`).catch(
                                    (cause) => setError(String(cause)),
                                  )
                                }
                              >
                                <FolderClosedIcon />
                                {project.title}
                              </MenuItem>
                            ))}
                          </MenuSubPopup>
                        </MenuSub>
                        <MenuSeparator />
                        <MenuItem
                          variant="destructive"
                          onClick={() =>
                            void runSelectionAction(page, "delete").catch((cause) =>
                              setError(String(cause)),
                            )
                          }
                        >
                          <Trash2Icon />
                          Delete (
                          {selection.has(page.id)
                            ? allPages.filter((row) => selection.has(row.id)).length
                            : 1}
                          )
                        </MenuItem>
                      </MenuPopup>
                    </Menu>
                  </div>
                </CollectionTableCell>
              </PagesPageItemRow>
            );
          })}
        </CollectionRows>
      ) : null}
      {!collapsed[group.key] && group.pages.length === 0 ? (
        <p className="px-8 py-2 text-sm text-muted-foreground">No pages.</p>
      ) : null}
    </section>
  );
  return (
    <SidebarInset variant="standalone" className="min-h-0 overflow-hidden">
      <WorkspaceItemTabs
        target={environmentId ? { kind: "page", environmentId, id: null, title: "Pages" } : null}
      />
      <WorkspaceSurfaceHeader
        title={currentFolder?.title ?? "Pages"}
        actions={
          <Menu>
            <MenuTrigger render={<Button variant="outline" />} disabled={!environmentId}>
              <PlusIcon />
              Create
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem onClick={() => startCreate("folder")}>
                <FolderFileStorageIcon />
                Folder
              </MenuItem>
              <MenuItem onClick={() => startCreate("page")}>
                <FileTextIcon />
                Page
              </MenuItem>
            </MenuPopup>
          </Menu>
        }
      />
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("application/elysia-pages")) event.preventDefault();
        }}
        onDrop={(event) => dropIntoFolder(event, currentFolderId)}
      >
        <WorkspacePageContainer width="surface" className="min-h-0 flex-1 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="w-60 max-w-full">
              <InputGroup>
                <InputGroupAddon>
                  <SearchIcon className="size-4" />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  placeholder="Search pages"
                  aria-label="Search pages"
                  value={search}
                  onValueChange={setSearch}
                />
              </InputGroup>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <CollectionViewPicker view={view} onChange={setView} pages />
              <CollectionPropertiesPicker
                options={PAGE_PROPERTIES}
                value={properties}
                onChange={setProperties}
              />
              <Menu>
                <MenuTrigger
                  render={<Button variant="outline" size="compact" />}
                  aria-label="Group pages"
                >
                  <Columns2Icon />
                  Group
                </MenuTrigger>
                <MenuPopup align="start">
                  <MenuGroup>
                    <MenuGroupLabel>Group by</MenuGroupLabel>
                    <MenuRadioGroup
                      value={grouping}
                      onValueChange={(value) => {
                        if (value === "project" || value === "type" || value === "none")
                          setGrouping(value);
                      }}
                    >
                      <MenuRadioItem value="project">Project</MenuRadioItem>
                      <MenuRadioItem value="type">Type</MenuRadioItem>
                      <MenuRadioItem value="none">No grouping</MenuRadioItem>
                    </MenuRadioGroup>
                  </MenuGroup>
                  <MenuSeparator />
                  <MenuGroup>
                    <MenuGroupLabel>Subgroup by</MenuGroupLabel>
                    <MenuRadioGroup
                      value={subGrouping}
                      onValueChange={(value) => {
                        if (value === "project" || value === "type" || value === "none")
                          setSubGrouping(value);
                      }}
                    >
                      <MenuRadioItem value="project" disabled={grouping === "project"}>
                        Project
                      </MenuRadioItem>
                      <MenuRadioItem value="type" disabled={grouping === "type"}>
                        Type
                      </MenuRadioItem>
                      <MenuRadioItem value="none">No subgrouping</MenuRadioItem>
                    </MenuRadioGroup>
                  </MenuGroup>
                  {groupByProject ? (
                    <>
                      <MenuSeparator />
                      <MenuGroup>
                        <MenuGroupLabel>Project order</MenuGroupLabel>
                        <MenuRadioGroup
                          value={groupDescending ? "desc" : "asc"}
                          onValueChange={(value) => setGroupDescending(value === "desc")}
                        >
                          <MenuRadioItem value="asc">A–Z</MenuRadioItem>
                          <MenuRadioItem value="desc">Z–A</MenuRadioItem>
                        </MenuRadioGroup>
                      </MenuGroup>
                    </>
                  ) : null}
                </MenuPopup>
              </Menu>
              <Menu>
                <MenuTrigger
                  render={<Button variant="outline" size="compact" />}
                  aria-label="Sort pages"
                >
                  <ArrowUpDownIcon />
                  {sort === "updated" ? "Updated" : sort === "created" ? "Created" : "Title"}
                </MenuTrigger>
                <MenuPopup align="start">
                  <MenuGroup>
                    <MenuGroupLabel>Sort pages</MenuGroupLabel>
                    <MenuRadioGroup
                      value={sort}
                      onValueChange={(value) => {
                        if (value === "updated" || value === "created" || value === "title")
                          setSort(value);
                      }}
                    >
                      <MenuRadioItem value="updated">Recently updated</MenuRadioItem>
                      <MenuRadioItem value="created">Recently created</MenuRadioItem>
                      <MenuRadioItem value="title">Title</MenuRadioItem>
                    </MenuRadioGroup>
                  </MenuGroup>
                </MenuPopup>
              </Menu>
              <Menu>
                <MenuTrigger
                  render={<Button variant="outline" size="icon-sm" />}
                  aria-label="Page display settings"
                >
                  <SlidersHorizontalIcon />
                </MenuTrigger>
                <MenuPopup align="end">
                  <MenuGroup>
                    <MenuGroupLabel>Settings</MenuGroupLabel>
                    <MenuCheckboxItem
                      checked={hideEmpty}
                      onCheckedChange={setHideEmpty}
                      disabled={grouping === "none"}
                    >
                      Hide empty groups
                    </MenuCheckboxItem>
                  </MenuGroup>
                  {view === "card" || view === "board" ? (
                    <CollectionCardSizePicker value={cardSize} onChange={setCardSize} />
                  ) : null}
                </MenuPopup>
              </Menu>
            </div>
          </div>
          {currentFolderId !== null ? (
            <nav aria-label="Folder path" className="flex flex-wrap items-center gap-2 text-sm">
              <button
                type="button"
                className="cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={() => setCurrentFolderId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => dropIntoFolder(event, null)}
              >
                Pages
              </button>
              {breadcrumbs.map((folder) => (
                <button
                  type="button"
                  key={folder.id}
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                  onClick={() => setCurrentFolderId(folder.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => dropIntoFolder(event, folder.id)}
                >
                  {" "}
                  / {folder.title}
                </button>
              ))}
            </nav>
          ) : null}
          {query.error || (!createOpen && error) ? (
            <p role="alert" className="text-sm text-destructive">
              {query.error ?? error}
            </p>
          ) : null}
          {query.isPending && !query.data ? (
            <p role="status" className="px-3 text-sm text-muted-foreground">
              Loading pages…
            </p>
          ) : query.data && !groups.some((group) => group.pages.length) ? (
            <Empty>
              <Files01Icon aria-hidden className="size-16 text-muted-foreground" />
              <EmptyHeader>
                <EmptyTitle>
                  {query.data.pages.length ? "No matching pages" : "No pages"}
                </EmptyTitle>
                <EmptyDescription>
                  {query.data.pages.length
                    ? "Try a different search to find your pages."
                    : "Pages from every project in this workspace appear here."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <CollectionGroups
              view={view}
              columns={[
                { id: "title", label: "Title" },
                ...propertyColumns,
                { id: "actions", label: "Actions" },
              ]}
            >
              {groups.map(renderGroup)}{" "}
              {groups.every((group) => group.pages.length === 0) ? (
                <p className="px-3 text-sm text-muted-foreground">No matching pages.</p>
              ) : null}
            </CollectionGroups>
          )}
        </WorkspacePageContainer>
      </div>
      <Dialog
        open={movingIds !== null}
        onOpenChange={(open) => {
          if (!open && !bulkPending) setMovingIds(null);
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Move to folder</DialogTitle>
            <DialogDescription>
              Choose a destination for the selected pages and folders.
            </DialogDescription>
          </DialogHeader>
          <form
            id="move-pages"
            className="flex flex-col gap-4 px-6 pb-6"
            onSubmit={(event) => {
              event.preventDefault();
              if (!movingIds) return;
              void moveItems(
                movingIds,
                moveDestination === "none" ? null : PageId.make(moveDestination),
              )
                .then((moved) => {
                  if (moved) setMovingIds(null);
                })
                .catch((cause) => setError(String(cause)));
            }}
          >
            <Select
              value={moveDestination}
              onValueChange={(value) => {
                if (value !== null) setMoveDestination(value);
              }}
              disabled={bulkPending}
            >
              <SelectTrigger aria-label="Destination folder">
                <FolderFileStorageIcon />
                <SelectValue>
                  {folders.find((folder) => folder.id === moveDestination)?.title ?? "No Folder"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="none">
                  <FolderFileStorageIcon />
                  No Folder
                </SelectItem>
                {pageMoveDestinations(allPages, new Set(movingIds ?? [])).map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    <FolderFileStorageIcon />
                    {folder.title}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </form>
          <DialogFooter>
            <Button variant="outline" disabled={bulkPending} onClick={() => setMovingIds(null)}>
              Cancel
            </Button>
            <Button type="submit" form="move-pages" disabled={bulkPending}>
              {bulkPending ? "Moving…" : "Move"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!saving) setCreateOpen(open);
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>
              {renaming ? "Rename" : createKind === "folder" ? "New folder" : "New page"}
            </DialogTitle>
            <DialogDescription>
              Create a personal page, optionally linked to a project.
            </DialogDescription>
          </DialogHeader>
          <form
            id="create-page"
            className="flex flex-col gap-4 px-6 pb-6"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            {!renaming ? (
              <label className="flex flex-col gap-2 text-sm">
                Type
                <Select
                  value={createKind}
                  onValueChange={(value) => {
                    if (value === "page" || value === "folder") setCreateKind(value);
                  }}
                >
                  <SelectTrigger aria-label="Item type">
                    <SelectValue>{createKind === "folder" ? "Folder" : "Page"}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="page">Page</SelectItem>
                    <SelectItem value="folder">Folder</SelectItem>
                  </SelectPopup>
                </Select>
              </label>
            ) : null}
            <label className="flex flex-col gap-2 text-sm">
              <span>Title</span>
              <Input
                autoFocus
                aria-label="Page title"
                placeholder="Page title"
                maxLength={200}
                value={title}
                disabled={saving}
                onValueChange={setTitle}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Parent folder
              <Select
                value={createParent}
                onValueChange={(value) => {
                  if (value !== null) {
                    setCreateParent(value);
                    setProjectId(
                      folders.find((folder) => folder.id === value)?.projectId ?? "none",
                    );
                  }
                }}
              >
                <SelectTrigger aria-label="Parent folder">
                  <SelectValue>
                    {folders.find((folder) => folder.id === createParent)?.title ?? "None"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="none">None</SelectItem>
                  {folders
                    .filter((folder) => folder.id !== renaming?.id)
                    .map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folder.title}
                      </SelectItem>
                    ))}
                </SelectPopup>
              </Select>
            </label>
            <div className="flex flex-col gap-2 text-sm">
              <span>Project</span>
              <Select
                value={projectId}
                disabled={
                  saving || Boolean(folders.find((folder) => folder.id === createParent)?.projectId)
                }
                onValueChange={(value) => {
                  if (value) setProjectId(value);
                }}
              >
                <SelectTrigger aria-label="Page project">
                  <SelectValue>
                    {projects.find((project) => project.id === projectId)?.title ?? "No Project"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup alignItemWithTrigger={false}>
                  <SelectItem value="none">No Project</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.title}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </form>
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-page"
              variant="outline"
              disabled={saving || !title.trim()}
            >
              {saving
                ? "Saving…"
                : renaming
                  ? "Save"
                  : createKind === "folder"
                    ? "Create folder"
                    : "Create page"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </SidebarInset>
  );
}

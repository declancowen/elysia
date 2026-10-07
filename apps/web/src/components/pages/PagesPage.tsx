import { formatComposerContextReference } from "@t3tools/shared/composerContextReferences";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { formatCalendarDate } from "@t3tools/shared/dateFormat";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { ComposerContextId, ProjectId, type PageId, type PageSummary } from "@t3tools/contracts";
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
  ArrowUpDownIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  Files01Icon,
  FolderClosedIcon,
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
} from "../ui/menu";
import { SidebarInset } from "../ui/sidebar";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { groupPages } from "./PagesPage.logic";
import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import {
  CollectionGroups,
  CollectionRows,
  CollectionViewPicker,
  CollectionPropertyPill,
  CollectionPropertiesPicker,
  CollectionTableCell,
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

export function PagesPage() {
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
  const [view, setView] = useState<CollectionView>("list");
  const [properties, setProperties] = useState<CollectionProperty[]>(["project"]);
  const [groupByProject, setGroupByProject] = useState(true);
  const [groupDescending, setGroupDescending] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(true);
  const propertyColumns = PAGE_PROPERTIES.filter(
    (property) =>
      properties.includes(property.id) && (property.id !== "project" || !groupByProject),
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sort, setSort] = useState<"updated" | "created" | "title">("updated");
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("none");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const { copyToClipboard } = useCopyToClipboard({ onError: (error) => setError(error.message) });
  const [selection, setSelection] = useState<Set<PageId>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const groups = useMemo(
    () =>
      groupPages(query.data?.pages ?? [], projects, {
        search,
        groupByProject,
        sort,
        groupDescending,
        hideEmpty,
      }),
    [query.data, projects, search, groupByProject, sort, groupDescending, hideEmpty],
  );
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
  const showSelectionMenu = async (page: PageSummary, position: { x: number; y: number }) => {
    if (!environmentId || bulkPending) return;
    const ids = selection.has(page.id) ? selection : new Set([page.id]);
    setSelection(new Set(ids));
    const selectedPages = groups.flatMap((group) => group.pages).filter((row) => ids.has(row.id));
    const action = await showContextMenuFallback(
      [
        { id: "open-new-tab", label: "Open in new tab", icon: "open-new-tab" },
        { id: "copy-id", label: "Copy ID" },
        { id: "copy-reference", label: "Copy reference" },
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
    if (!action) return;
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
        `Permanently delete ${selectedPages.length} selected pages? This cannot be undone.`,
        { variant: "destructive" },
      ))
    )
      return;
    if (action !== "delete" && !action.startsWith("project:")) return;
    setBulkPending(true);
    setError(null);
    const { completed, failures } = await applyWorkspaceBulkAction(selectedPages, async (row) => {
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
    });
    setSelection((current) => new Set([...current].filter((id) => !completed.has(id))));
    setBulkPending(false);
    if (failures.length) setError(failures.join("\n"));
  };
  const create = async () => {
    if (!environmentId || !title.trim() || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    const result = await savePage({
      environmentId,
      input: {
        title: title.trim(),
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
    void navigate({
      to: "/pages/$pageId",
      params: { pageId: result.value.page.id },
    });
  };
  return (
    <SidebarInset variant="standalone" className="min-h-0 overflow-hidden">
      <WorkspaceItemTabs
        target={environmentId ? { kind: "page", environmentId, id: null, title: "Pages" } : null}
      />
      <WorkspaceSurfaceHeader
        title="Pages"
        actions={
          <Button
            variant="outline"
            aria-label="Create page"
            disabled={!environmentId}
            onClick={() => {
              setError(null);
              setCreateOpen(true);
            }}
          >
            <PlusIcon />
            Create page
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
              <CollectionViewPicker view={view} onChange={setView} />
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
                <MenuPopup align="end">
                  <MenuGroup>
                    <MenuGroupLabel>Group by</MenuGroupLabel>
                    <MenuRadioGroup
                      value={groupByProject ? "project" : "none"}
                      onValueChange={(value) => setGroupByProject(value === "project")}
                    >
                      <MenuRadioItem value="project">Project</MenuRadioItem>
                      <MenuRadioItem value="none">No grouping</MenuRadioItem>
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
                <MenuPopup align="end">
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
                  <MenuCheckboxItem
                    checked={hideEmpty}
                    onCheckedChange={setHideEmpty}
                    disabled={!groupByProject}
                  >
                    Hide empty groups
                  </MenuCheckboxItem>
                </MenuPopup>
              </Menu>
            </div>
          </div>
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
            <CollectionGroups view={view}>
              {groups.map((group) => (
                <section
                  key={group.key}
                  className={cn("min-w-0 space-y-3", view === "board" && "w-72 shrink-0")}
                >
                  {group.title ? (
                    <h2>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-md bg-muted/20 px-3 py-2 text-left text-sm text-muted-foreground outline-none ring-1 ring-inset ring-border/60 hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-ring"
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
                        <FolderClosedIcon className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{group.title}</span>
                        <span className="text-xs">{group.pages.length}</span>
                      </button>
                    </h2>
                  ) : null}
                  {!collapsed[group.key] ? (
                    <CollectionRows
                      view={view}
                      label="Pages"
                      columns={[
                        { id: "title", label: "Title" },
                        ...propertyColumns,
                        { id: "actions", label: "Actions" },
                      ]}
                    >
                      {group.pages.map((page) => (
                        <div
                          key={page.id}
                          role={view === "table" ? "row" : undefined}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            void showSelectionMenu(page, {
                              x: event.clientX,
                              y: event.clientY,
                            }).catch((error) => setError(String(error)));
                          }}
                          className={cn(
                            "group relative min-w-0 gap-3 rounded-lg hover:bg-sidebar-row-hover",
                            view === "list"
                              ? "flex items-center px-3"
                              : view === "table"
                                ? "grid grid-cols-[var(--collection-columns)] items-center rounded-none border-b border-border px-3"
                                : "flex flex-col border border-border bg-card p-4",
                            selection.has(page.id) && "bg-sidebar-row-selected",
                          )}
                        >
                          <CollectionTableCell view={view} align="left">
                            <WorkspaceItemLink
                              onOpen={(newTab) => openPage(page, newTab)}
                              className={cn(
                                "flex min-w-0 flex-1 gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                view === "list" || view === "table"
                                  ? "items-center py-3"
                                  : "flex-col pr-16",
                                view === "card" && "min-h-32",
                              )}
                            >
                              <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                              <span
                                className={
                                  view === "list" || view === "table"
                                    ? "min-w-0 flex-1 truncate text-sm"
                                    : "line-clamp-3 text-sm font-medium leading-6"
                                }
                              >
                                {page.title}
                              </span>
                            </WorkspaceItemLink>
                          </CollectionTableCell>
                          {propertyColumns.length ? (
                            <div
                              className={
                                view === "table" ? "contents" : "flex flex-wrap justify-end gap-2"
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
                                      disabled={bulkPending || !environmentId}
                                      onChange={(value) => {
                                        if (!environmentId) return;
                                        setError(null);
                                        void savePage({
                                          environmentId,
                                          input: {
                                            id: page.id,
                                            expectedRevision: page.revision,
                                            projectId:
                                              value === "none" ? null : ProjectId.make(value),
                                          },
                                        })
                                          .then((result) => {
                                            if (result._tag === "Failure")
                                              setError(String(squashAtomCommandFailure(result)));
                                          })
                                          .catch((error) => setError(String(error)));
                                      }}
                                    >
                                      {projects.find((project) => project.id === page.projectId)
                                        ?.title ?? "No Project"}
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
                                (view === "card" || view === "board") && "absolute top-3 right-3",
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
                                  <MenuItem onClick={() => copyToClipboard(page.id, undefined)}>
                                    Copy ID
                                  </MenuItem>
                                  <MenuItem
                                    onClick={() =>
                                      copyToClipboard(
                                        formatComposerContextReference({
                                          kind: "page",
                                          contextId: ComposerContextId.make(page.id),
                                          label: page.title,
                                        }),
                                        undefined,
                                      )
                                    }
                                  >
                                    Copy reference
                                  </MenuItem>
                                  <MenuItem onClick={() => openPage(page)}>Open page</MenuItem>
                                  <MenuItem onClick={() => openPage(page, true)}>
                                    Open in new tab
                                  </MenuItem>
                                </MenuPopup>
                              </Menu>
                            </div>
                          </CollectionTableCell>
                        </div>
                      ))}
                    </CollectionRows>
                  ) : null}
                  {!collapsed[group.key] && group.pages.length === 0 ? (
                    <p className="px-8 py-2 text-sm text-muted-foreground">No pages.</p>
                  ) : null}
                </section>
              ))}
              {groups.every((group) => group.pages.length === 0) ? (
                <p className="px-3 text-sm text-muted-foreground">No matching pages.</p>
              ) : null}
            </CollectionGroups>
          )}
        </WorkspacePageContainer>
      </div>
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!saving) setCreateOpen(open);
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>New page</DialogTitle>
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
            <div className="flex flex-col gap-2 text-sm">
              <span>Project</span>
              <Select
                value={projectId}
                disabled={saving}
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
              {saving ? "Creating…" : "Create page"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </SidebarInset>
  );
}

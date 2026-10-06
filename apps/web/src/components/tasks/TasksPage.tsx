import { formatCalendarDate } from "@t3tools/shared/dateFormat";
import {
  DndContext,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { TaskAgentResponse } from "./TaskAgentResponse";
import { TaskDragRow, TaskDropGroup } from "./TaskDrag";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
  type RefObject,
} from "react";
import { useBlocker, useNavigate, useSearch } from "@tanstack/react-router";
import {
  type WorkTaskId,
  type WorkTask,
  type WorkTaskSummary,
  type WorkTaskSaveInput,
  type WorkTaskStatus,
  type ProjectId,
  type EnvironmentId,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { usePrimaryEnvironment } from "../../state/environments";
import { useRegularProjects } from "../../hooks/useRegularProjects";
import { useProjects } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { ensureLocalApi } from "../../localApi";
import { showContextMenuFallback, contextMenuAgentIcon } from "../../contextMenuFallback";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  ArrowLeftIcon,
  Trash2Icon,
  FolderClosedIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleCheckIcon,
  CircleXIcon,
  CircleIcon,
  MoreHorizontalIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowUpDownIcon,
  ListFilterIcon,
  SlidersHorizontalIcon,
  Columns2Icon,
  AlignBoxMiddleLeftIcon,
  ChannelIcon,
  SquareArrowOutUpRightIcon,
  TaskEdit02Icon,
} from "../../icons";
import ChatMarkdown from "../ChatMarkdown";
import { Popover, PopoverTrigger, PopoverPopup } from "../ui/popover";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuCheckboxItem,
} from "../ui/menu";
import { cn } from "../../lib/utils";
import { WorkspaceRichTextEditor } from "../WorkspaceRichTextEditor";
import { useWorkspaceSideChat } from "../WorkspaceSideChat";
import { useConversationTabNavigation } from "../../hooks/useConversationTabNavigation";
import { useConversationTabsStore } from "../../conversationTabsStore";
import { WorkspaceItemTabs } from "../WorkspaceItemTabs";
import { WorkspaceItemLink } from "../WorkspaceItemLink";
import { WorkspaceSurfaceHeader } from "../WorkspaceSurfaceHeader";
import { WorkspaceDetailsPanel } from "../WorkspaceDetailsPanel";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "../ui/empty";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { applyWorkspaceBulkAction } from "../WorkspaceBulkActions";
import { SidebarInset } from "../ui/sidebar";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import { CollectionGroups, CollectionRows, CollectionViewPicker } from "../WorkspaceCollectionView";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { toastManager, stackedThreadToast } from "../ui/toast";
import { AgentAvatar } from "../agents/AgentAvatar";
import {
  groupTasks,
  visibleTasks,
  TASK_STATUS_LABELS,
  taskActivity,
  type TaskGrouping,
  type TaskSort,
  type TaskView,
  type TaskGroup,
} from "./taskViews";

function TaskSelect({
  label,
  value,
  options,
  onChange,
  compact = false,
  icon,
}: {
  label: string;
  compact?: boolean;
  icon?: ReactNode;
  value: string;
  options: readonly { value: string; label: ReactNode }[];
  onChange: (value: string) => void;
}) {
  if (compact)
    return (
      <Menu>
        <MenuTrigger render={<Button variant="outline" size="compact" aria-label={label} />}>
          {icon}
          {options.find((item) => item.value === value)?.label ?? label}
        </MenuTrigger>
        <MenuPopup align="end">
          <MenuRadioGroup value={value} onValueChange={onChange}>
            {options.map((item) => (
              <MenuRadioItem key={item.value} value={item.value}>
                {item.label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuPopup>
      </Menu>
    );
  return (
    <Select
      value={value}
      onValueChange={(value) => {
        if (value !== null) onChange(value);
      }}
    >
      <SelectTrigger aria-label={label}>
        <SelectValue>{options.find((item) => item.value === value)?.label ?? label}</SelectValue>
      </SelectTrigger>
      <SelectPopup alignItemWithTrigger={false}>
        {options.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
const statusOptions = Object.entries(TASK_STATUS_LABELS).map(([value, label]) => ({
  value,
  label: (
    <span className="flex items-center gap-2">
      <TaskStatusIcon status={value as WorkTaskStatus} />
      {label}
    </span>
  ),
}));
const groupingOptions = [
  { value: "none", label: "No grouping" },
  { value: "status", label: "Status" },
  { value: "project", label: "Project" },
];
function report(error: unknown) {
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title: "Could not save task",
      description: error instanceof Error ? error.message : "Try again.",
    }),
  );
}

export function TasksPage() {
  const environment = usePrimaryEnvironment();
  const allProjects = useProjects();
  const regularProjects = useRegularProjects(false);
  const projects = regularProjects.filter(
    (project) => project.environmentId === environment?.environmentId,
  );
  const agents = allProjects.filter(
    (project) =>
      project.environmentId === environment?.environmentId &&
      project.agentProfile &&
      !project.agentProfile.archived,
  );
  const tasksQuery = useEnvironmentQuery(
    environment?.connection.phase === "connected"
      ? serverEnvironment.tasksLive({
          environmentId: environment.environmentId,
          input: {},
        })
      : null,
  );
  const saveCommand = useAtomCommand(serverEnvironment.saveTask);
  const deleteCommand = useAtomCommand(serverEnvironment.deleteTask);
  const navigate = useNavigate();
  const navigateTab = useConversationTabNavigation();
  const { task: selectedId } = useSearch({ from: "/tasks" });
  const [panelOpen, setPanelOpen] = useState(true);
  const panelAnchor = useRef<HTMLButtonElement | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingParent, setCreatingParent] = useState<WorkTaskId | null>(null);
  const [showSubTasks, setShowSubTasks] = useState(true);
  const [view, setView] = useState<TaskView>("list");
  const [grouping, setGrouping] = useState<TaskGrouping>("status");
  const [subGrouping, setSubGrouping] = useState<TaskGrouping>("none");
  const [hideEmpty, setHideEmpty] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [sort, setSort] = useState<TaskSort>("updated");
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Set<WorkTaskId>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const selectedQuery = useEnvironmentQuery(
    environment && selectedId
      ? serverEnvironment.task({
          environmentId: environment.environmentId,
          input: { id: selectedId },
        })
      : null,
  );
  const summary = tasksQuery.data?.tasks.find((task) => task.id === selectedId);
  const selected = !tasksQuery.data || !summary ? undefined : selectedQuery.data?.task;
  const sideChat = useWorkspaceSideChat({
    environmentId: environment?.environmentId ?? null,
    target: selected ? { kind: "task", id: selected.id } : null,
    title: selected?.title ?? "",
    projectId: selected?.projectId ?? null,
    onOpen: () => setPanelOpen(false),
  });
  const refreshSelected = selectedQuery.refresh;
  useEffect(() => {
    if (
      summary &&
      selected &&
      (summary.revision !== selected.revision ||
        summary.startError !== selected.startError ||
        summary.startedThreadId !== selected.startedThreadId)
    )
      refreshSelected();
  }, [summary, selected, refreshSelected]);
  const taskRows = useMemo(
    () =>
      visibleTasks(tasksQuery.data?.tasks ?? [], {
        search,
        status: statusFilter,
        project: projectFilter,
        sort,
      }),
    [tasksQuery.data, search, statusFilter, projectFilter, sort],
  );
  const taskIds = new Set(taskRows.map((task) => task.id));
  const rootRows = taskRows.filter((task) => !task.parentTaskId || !taskIds.has(task.parentTaskId));
  const children = new Map<WorkTaskId, WorkTaskSummary[]>();
  for (const task of taskRows) {
    if (task.parentTaskId && taskIds.has(task.parentTaskId)) {
      const siblings = children.get(task.parentTaskId) ?? [];
      siblings.push(task);
      children.set(task.parentTaskId, siblings);
    }
  }
  const groups = groupTasks(rootRows, grouping, subGrouping, projects, hideEmpty);
  const parentOptions = [
    { value: "none", label: "No parent" },
    ...(tasksQuery.data?.tasks ?? [])
      .filter((task) => task.id !== selectedId && !task.parentTaskId)
      .map((task) => ({ value: task.id, label: task.title })),
  ];
  const displayRows = (
    rows: WorkTaskSummary[],
    depth = 0,
  ): { task: WorkTaskSummary; depth: number }[] =>
    rows.flatMap((task) => [
      { task, depth },
      ...(showSubTasks ? displayRows(children.get(task.id) ?? [], depth + 1) : []),
    ]);
  const projectOptions = [
    { value: "none", label: "No project" },
    ...projects.map((project) => ({ value: project.id, label: project.title })),
  ];
  const agentOptions = [
    { value: "none", label: "No agent or channel" },
    ...agents.map((project) => ({
      value: project.id,
      label: (
        <span className="flex items-center gap-2">
          {project.agentProfile!.group ? (
            <ChannelIcon className="size-4" />
          ) : (
            <AgentAvatar avatar={project.agentProfile!.avatar} />
          )}
          {project.title}
        </span>
      ),
    })),
  ];
  const save = useCallback(
    async (input: WorkTaskSaveInput) => {
      if (!environment) throw new Error("Connect to your environment to save tasks.");
      const result = await saveCommand({
        environmentId: environment.environmentId,
        input,
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      if (input.id === selectedId) refreshSelected();
      return result.value.task;
    },
    [environment, saveCommand, selectedId, refreshSelected],
  );
  const update = (input: WorkTaskSaveInput) => {
    void save(input).catch(report);
  };
  const openTask = (task: WorkTaskSummary | WorkTask, newTab = false) => {
    if (!environment) return;
    const target = {
      kind: "task" as const,
      environmentId: environment.environmentId,
      id: task.id,
      title: task.title,
    };
    useConversationTabsStore.getState().open(target, newTab);
    void navigateTab(target);
  };
  const remove = async (task: WorkTaskSummary | WorkTask) => {
    if (
      !environment ||
      !(await ensureLocalApi().dialogs.confirm(
        `Permanently delete “${task.title}”? This cannot be undone.`,
        { variant: "destructive" },
      ))
    )
      return;
    const result = await deleteCommand({
      environmentId: environment.environmentId,
      input: { id: task.id },
    });
    if (result._tag === "Failure") report(squashAtomCommandFailure(result));
    else if (selectedId === task.id) void navigate({ to: "/tasks", search: {} });
  };
  const toggle = (key: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const showSelectionMenu = async (task: WorkTaskSummary, position: { x: number; y: number }) => {
    if (!environment || bulkPending) return;
    const ids = selection.has(task.id) ? selection : new Set([task.id]);
    setSelection(new Set(ids));
    const selectedTasks = taskRows.filter((row) => ids.has(row.id));
    const action = await showContextMenuFallback(
      [
        { id: "open-new-tab", label: "Open in new tab", icon: "open-new-tab" },
        {
          id: "assignee",
          label: "Change assigned",
          icon: "workspace-assigned",
          children: [
            { id: "assignee:none", label: "No agent or channel", icon: "workspace-assigned" },
            ...agents.map((agent) => ({
              id: `assignee:${agent.id}`,
              label: agent.title,
              icon: agent.agentProfile!.group
                ? "workspace-channel"
                : contextMenuAgentIcon(agent.agentProfile!.avatar),
            })),
          ],
        },
        {
          id: "project",
          label: "Change project",
          icon: "workspace-project",
          children: projectOptions.map((project) => ({
            id: `project:${project.value}`,
            label: project.label,
            icon: "workspace-project",
          })),
        },
        {
          id: "status",
          label: "Change status",
          icon: "task-todo",
          children: Object.entries(TASK_STATUS_LABELS).map(([status, label]) => ({
            id: `status:${status}`,
            label,
            icon: `task-${status}`,
          })),
        },
        {
          id: "delete",
          label: `Delete (${selectedTasks.length})`,
          destructive: true,
          icon: "workspace-delete",
        },
      ],
      position,
    );
    if (!action) return;
    if (action === "open-new-tab") {
      openTask(task, true);
      return;
    }
    if (
      action === "delete" &&
      !(await ensureLocalApi().dialogs.confirm(
        `Permanently delete ${selectedTasks.length} selected tasks? This cannot be undone.`,
        { variant: "destructive" },
      ))
    )
      return;
    const [kind, value] = action.split(":");
    if (!["assignee", "project", "status", "delete"].includes(kind ?? "")) return;
    setBulkPending(true);
    const { completed, failures } = await applyWorkspaceBulkAction(selectedTasks, async (row) => {
      if (kind === "delete") {
        const result = await deleteCommand({
          environmentId: environment.environmentId,
          input: { id: row.id },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      } else {
        await save({
          id: row.id,
          expectedRevision: row.revision,
          ...(kind === "assignee"
            ? { assigneeProjectId: value === "none" ? null : (value as ProjectId) }
            : kind === "project"
              ? { projectId: value === "none" ? null : (value as ProjectId) }
              : { status: value as WorkTaskStatus }),
        });
      }
    });
    setSelection((current) => new Set([...current].filter((id) => !completed.has(id))));
    setBulkPending(false);
    if (failures.length) report(new Error(failures.join("\n")));
  };
  const renderRows = (rows: WorkTaskSummary[]) => (
    <CollectionRows view={view}>
      {displayRows(rows).map(({ task, depth }) => (
        <TaskDragRow
          key={task.id}
          task={task}
          depth={view === "list" ? 0 : depth}
          onContextMenu={(event) => {
            event.preventDefault();
            void showSelectionMenu(task, { x: event.clientX, y: event.clientY }).catch(report);
          }}
          className={cn(
            "group relative cursor-pointer overflow-hidden rounded-lg bg-card hover:bg-sidebar-row-hover",
            view === "list"
              ? "flex h-10 items-center gap-3 overflow-visible rounded-md bg-transparent px-3 py-2"
              : "border border-border",
            view === "card" && "flex h-72 flex-col",
            selection.has(task.id) && "bg-sidebar-row-selected",
          )}
        >
          {view === "list" && depth > 0 ? (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute bottom-[calc(50%-0.5px)] left-[calc(--spacing(12)-0.5px)] w-3 rounded-bl-md border-b border-l border-border",
                children.get(task.parentTaskId!)?.[0]?.id === task.id ? "-top-4" : "-top-7",
              )}
            />
          ) : null}
          {view === "card" ? (
            <WorkspaceItemLink
              aria-label={`Open ${task.title}`}
              onOpen={(newTab) => openTask(task, newTab)}
              className="min-h-0 flex-1 overflow-hidden bg-muted/20 p-5 pr-20 text-left text-sm text-muted-foreground"
            >
              <div className="pointer-events-none line-clamp-5">
                <ChatMarkdown text={task.descriptionPreview} cwd={undefined} />
              </div>
            </WorkspaceItemLink>
          ) : null}
          <WorkspaceItemLink
            onOpen={(newTab) => openTask(task, newTab)}
            className={cn(
              "flex min-w-0 gap-3 text-left",
              view === "list" ? "flex-1 items-center" : "w-full items-start p-4",
              view === "card" && "min-h-16 shrink-0 border-t border-border",
            )}
            style={view === "list" ? { marginInlineStart: depth * 24 } : undefined}
          >
            {view === "list" ? <TaskStatusIcon status={task.status} /> : null}
            <span
              className={cn(
                view === "list"
                  ? "truncate text-sm"
                  : "line-clamp-3 pr-16 text-sm font-medium leading-6",
              )}
            >
              {task.title}
            </span>
          </WorkspaceItemLink>
          <div
            className={
              view === "list"
                ? "flex shrink-0 items-center gap-3"
                : "mt-auto flex shrink-0 flex-col gap-2 border-t border-border px-4 py-3"
            }
          >
            {task.assigneeProjectId ? (
              <span className="min-w-0 text-sm">
                {agentOptions.find((option) => option.value === task.assigneeProjectId)?.label ??
                  "Unavailable agent"}
              </span>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Badge variant="outline">
                {task.assigneeProjectId
                  ? taskActivity(task.status).label
                  : TASK_STATUS_LABELS[task.status]}
              </Badge>
              <Badge variant="outline">
                <span className="max-w-32 truncate">
                  {projects.find((project) => project.id === task.projectId)?.title ?? "No project"}
                </span>
              </Badge>
            </div>
          </div>
          <div
            className={cn(
              "flex shrink-0 items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100",
              selection.has(task.id) && "opacity-100",
              view !== "list" && "absolute top-3 right-3 z-10",
            )}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Checkbox
              aria-label={`Select ${task.title}`}
              checked={selection.has(task.id)}
              disabled={bulkPending}
              onCheckedChange={(checked) =>
                setSelection((current) => {
                  const next = new Set(current);
                  if (checked) next.add(task.id);
                  else next.delete(task.id);
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
                    aria-label={`Options for ${task.title}`}
                  />
                }
              >
                <MoreHorizontalIcon className="size-4" />
              </MenuTrigger>
              <MenuPopup>
                <MenuItem onClick={() => openTask(task)}>Open task</MenuItem>
                <MenuItem onClick={() => openTask(task, true)}>
                  <SquareArrowOutUpRightIcon />
                  Open in new tab
                </MenuItem>
                {!task.parentTaskId ? (
                  <MenuItem
                    onClick={() => {
                      setCreatingParent(task.id);
                      setCreating(true);
                    }}
                  >
                    <PlusIcon />
                    Add subtask
                  </MenuItem>
                ) : null}
                <MenuItem onClick={() => void remove(task)}>
                  <Trash2Icon />
                  Delete task
                </MenuItem>
              </MenuPopup>
            </Menu>
          </div>
        </TaskDragRow>
      ))}
    </CollectionRows>
  );
  const renderGroup = (
    group: TaskGroup,
    parentDrop: TaskGroup["drop"] = {},
    parentKey = "",
  ): ReactNode => {
    const key = `${parentKey}/${group.key}`;
    const drop = { ...parentDrop, ...group.drop };
    const closed = collapsed.has(key);
    const orderedChildren = orderGroups(group.children, groupOrder);
    const moveGroup = (direction: -1 | 1) => {
      const siblings = orderGroups(
        parentKey ? groups.flatMap((group) => group.children) : groups,
        groupOrder,
      ).map((group) => group.key);
      const uniqueSiblings = [...new Set(siblings)];
      const index = uniqueSiblings.indexOf(group.key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= uniqueSiblings.length) return;
      [uniqueSiblings[index], uniqueSiblings[target]] = [
        uniqueSiblings[target]!,
        uniqueSiblings[index]!,
      ];
      setGroupOrder((previous) => [
        ...uniqueSiblings,
        ...previous.filter((entry) => !uniqueSiblings.includes(entry)),
      ]);
    };
    return (
      <TaskDropGroup
        key={key}
        id={key}
        drop={drop}
        className={cn("min-w-0", view === "board" && "w-72 shrink-0")}
      >
        <div
          className={cn(
            "mb-3 flex items-center gap-2 hover:bg-sidebar-row-hover",
            parentKey
              ? "ring-1 ring-inset ring-transparent"
              : "rounded-md bg-card/30 ring-1 ring-inset ring-border",
          )}
        >
          <button
            type="button"
            aria-expanded={!closed}
            onClick={() => toggle(key)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-muted-foreground"
          >
            {closed ? (
              <ChevronRightIcon className="size-4" />
            ) : (
              <ChevronDownIcon className="size-4" />
            )}
            {group.key.startsWith("project:") ? (
              <FolderClosedIcon className="size-4" />
            ) : group.key.startsWith("status:") ? (
              <TaskStatusIcon status={group.key.slice(7) as WorkTaskStatus} />
            ) : null}
            <span className="truncate">{group.label}</span>
            <span className="text-xs">{group.tasks.length}</span>
            {parentKey ? <span className="h-px flex-1 bg-border" /> : <span className="flex-1" />}
          </button>
          <Menu>
            <MenuTrigger
              render={
                <Button
                  variant="ghost-muted"
                  size="icon-xs"
                  aria-label={`Options for ${group.label}`}
                />
              }
            >
              <MoreHorizontalIcon className="size-4" />
            </MenuTrigger>
            <MenuPopup>
              <MenuItem onClick={() => moveGroup(-1)}>
                <ArrowUpIcon />
                Move earlier
              </MenuItem>
              <MenuItem onClick={() => moveGroup(1)}>
                <ArrowDownIcon />
                Move later
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
        {!closed &&
          (group.children.length ? (
            <div className="flex flex-col gap-4">
              {orderedChildren.map((child) => renderGroup(child, drop, key))}
            </div>
          ) : (
            renderRows(group.tasks)
          ))}
      </TaskDropGroup>
    );
  };
  return (
    <SidebarInset variant="standalone" className="min-h-0 overflow-hidden">
      <WorkspaceItemTabs
        target={
          environment
            ? selectedId
              ? summary
                ? {
                    kind: "task",
                    environmentId: environment.environmentId,
                    id: summary.id,
                    title: summary.title,
                  }
                : null
              : { kind: "task", environmentId: environment.environmentId, id: null, title: "Tasks" }
            : null
        }
      />
      <WorkspaceSurfaceHeader
        divider={!selectedId}
        title={
          selectedId ? (
            <Button
              variant="ghost-muted"
              size="sm"
              aria-label="Back to tasks"
              onClick={() => void navigate({ to: "/tasks", search: {} })}
            >
              <ArrowLeftIcon />
              Tasks
            </Button>
          ) : (
            "Tasks"
          )
        }
        actions={
          <>
            {selectedId ? (
              <Button
                ref={panelAnchor}
                variant="ghost-muted"
                size="icon-sm"
                aria-label="Task details"
                aria-expanded={panelOpen}
                onClick={() => {
                  sideChat.close();
                  setPanelOpen(!panelOpen);
                }}
              >
                <AlignBoxMiddleLeftIcon />
              </Button>
            ) : null}
            <Button
              variant="outline"
              aria-label="Create task"
              disabled={!environment || environment.connection.phase !== "connected"}
              onClick={() => {
                setCreatingParent(null);
                setCreating(true);
              }}
            >
              <PlusIcon />
              Create task
            </Button>
          </>
        }
      />
      <div
        className={
          selectedId
            ? "min-h-0 flex-1 overflow-y-auto"
            : "flex min-h-0 flex-1 flex-col overflow-hidden"
        }
      >
        <WorkspacePageContainer
          width="surface"
          className={selectedId ? undefined : "min-h-0 flex-1 pb-6"}
        >
          {tasksQuery.error ? (
            <p role="alert" className="text-sm text-destructive">
              {tasksQuery.error}
            </p>
          ) : null}
          {selectedId ? (
            selected ? (
              <TaskEditor
                key={selected.id}
                task={selected}
                environmentId={environment!.environmentId}
                initialRevision={summary?.revision ?? selected.revision}
                assignee={
                  agentOptions.find((option) => option.value === selected.assigneeProjectId)?.label
                }
                subtasks={(tasksQuery.data?.tasks ?? []).filter(
                  (task) => task.parentTaskId === selected.id,
                )}
                onOpenSubtask={openTask}
                onAddSubtask={() => {
                  setCreatingParent(selected.id);
                  setCreating(true);
                }}
                projectOptions={projectOptions}
                agentOptions={agentOptions}
                parentOptions={parentOptions}
                panelOpen={panelOpen}
                onPanelChange={setPanelOpen}
                panelAnchor={panelAnchor}
                onSave={save}
                onDelete={() => void remove(selected)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {selectedQuery.isPending || tasksQuery.isPending
                  ? "Loading task…"
                  : "This task is unavailable."}
              </p>
            )
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="w-56 max-w-full">
                  <Input
                    aria-label="Search tasks"
                    placeholder="Search tasks"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <CollectionViewPicker view={view} onChange={setView} />
                  <Popover>
                    <PopoverTrigger render={<Button variant="outline" size="compact" />}>
                      <Columns2Icon />
                      Group
                    </PopoverTrigger>
                    <PopoverPopup align="end" width="md">
                      <div className="grid grid-cols-2 gap-4">
                        <label className="flex flex-col gap-2 text-xs">
                          Group by
                          <TaskSelect
                            label="Group by"
                            value={grouping}
                            options={groupingOptions}
                            onChange={(value) => {
                              setGrouping(value as TaskGrouping);
                              if (value === subGrouping) setSubGrouping("none");
                            }}
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs">
                          Subgroup by
                          <TaskSelect
                            label="Subgroup by"
                            value={subGrouping}
                            options={groupingOptions.filter(
                              (item) => item.value !== grouping || item.value === "none",
                            )}
                            onChange={(value) => setSubGrouping(value as TaskGrouping)}
                          />
                        </label>
                      </div>
                    </PopoverPopup>
                  </Popover>
                  <TaskSelect
                    compact
                    icon={<ArrowUpDownIcon />}
                    label="Sort tasks"
                    value={sort}
                    options={[
                      { value: "updated", label: "Updated" },
                      { value: "created", label: "Created" },
                      { value: "title", label: "Title" },
                    ]}
                    onChange={(value) => setSort(value as TaskSort)}
                  />
                  <Popover>
                    <PopoverTrigger render={<Button variant="outline" size="compact" />}>
                      <ListFilterIcon />
                      Filters{statusFilter || projectFilter ? " ·" : ""}
                    </PopoverTrigger>
                    <PopoverPopup align="end" width="sm">
                      <div className="flex flex-col gap-4">
                        <label className="flex flex-col gap-2 text-xs">
                          Status
                          <TaskSelect
                            label="Status filter"
                            value={statusFilter}
                            options={[{ value: "", label: "All statuses" }, ...statusOptions]}
                            onChange={setStatusFilter}
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs">
                          Project
                          <TaskSelect
                            label="Project filter"
                            value={projectFilter}
                            options={[{ value: "", label: "All projects" }, ...projectOptions]}
                            onChange={setProjectFilter}
                          />
                        </label>
                      </div>
                    </PopoverPopup>
                  </Popover>
                  <Menu>
                    <MenuTrigger
                      render={
                        <Button variant="outline" size="icon-sm" aria-label="Task view settings" />
                      }
                    >
                      <SlidersHorizontalIcon />
                    </MenuTrigger>
                    <MenuPopup align="end">
                      <MenuCheckboxItem
                        checked={hideEmpty}
                        onCheckedChange={setHideEmpty}
                        closeOnClick={false}
                      >
                        Hide empty groups
                      </MenuCheckboxItem>
                      <MenuCheckboxItem
                        checked={showSubTasks}
                        onCheckedChange={setShowSubTasks}
                        closeOnClick={false}
                      >
                        Show subtasks
                      </MenuCheckboxItem>
                    </MenuPopup>
                  </Menu>
                </div>
              </div>
              {tasksQuery.isPending && !tasksQuery.data ? (
                <p className="text-muted-foreground">Loading tasks…</p>
              ) : null}
              <DndContext
                sensors={sensors}
                collisionDetection={(args) => {
                  const hits = pointerWithin(args);
                  return (hits.length ? hits : rectIntersection(args)).toSorted(
                    (a, b) => String(b.id).split("/").length - String(a.id).split("/").length,
                  );
                }}
                onDragEnd={({ active, over }) => {
                  if (over?.data.current?.drop && active.data.current?.task)
                    update({
                      id: active.data.current.task.id,
                      ...over.data.current.drop,
                    });
                }}
              >
                {taskRows.length ? (
                  <CollectionGroups view={view}>
                    {orderGroups(groups, groupOrder).map((group) => renderGroup(group))}
                  </CollectionGroups>
                ) : null}
              </DndContext>
              {tasksQuery.data && !tasksQuery.isPending && !taskRows.length ? (
                <Empty>
                  <TaskEdit02Icon aria-hidden className="size-16 text-muted-foreground" />
                  <EmptyHeader>
                    <EmptyTitle>
                      {tasksQuery.data.tasks.length ? "No matching tasks" : "No tasks"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {tasksQuery.data.tasks.length
                        ? "Try a different search or widen your filters."
                        : "Tasks from every project in this workspace appear here."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : null}
            </>
          )}
          <TaskCreateDialog
            key={`create:${creatingParent ?? "root"}`}
            parentTaskId={creatingParent}
            parentOptions={parentOptions}
            open={creating}
            onOpenChange={setCreating}
            projectOptions={projectOptions}
            agentOptions={agentOptions}
            onSave={async (input) => {
              const task = await save(input);
              setCreating(false);
              openTask(task);
            }}
          />
        </WorkspacePageContainer>
      </div>
      {sideChat.panel}
    </SidebarInset>
  );
}

function TaskProperties({
  value,
  projectOptions,
  agentOptions,
  parentOptions,
  onChange,
}: {
  value: Pick<WorkTaskSaveInput, "status" | "projectId" | "assigneeProjectId" | "parentTaskId">;
  projectOptions: { value: string; label: ReactNode }[];
  agentOptions: { value: string; label: ReactNode }[];
  parentOptions: { value: string; label: ReactNode }[];
  onChange: (patch: WorkTaskSaveInput) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm">
        Status
        <TaskSelect
          label="Task status"
          value={value.status ?? "todo"}
          options={statusOptions}
          onChange={(status) => onChange({ status: status as WorkTaskStatus })}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm">
        Project
        <TaskSelect
          label="Task project"
          value={value.projectId ?? "none"}
          options={projectOptions}
          onChange={(id) => onChange({ projectId: id === "none" ? null : (id as ProjectId) })}
        />
      </label>
      {agentOptions.length > 1 ? (
        <label className="flex flex-col gap-2 text-sm">
          Agent or channel
          <TaskSelect
            label="Assigned agent or channel"
            value={value.assigneeProjectId ?? "none"}
            options={agentOptions}
            onChange={(id) =>
              onChange({
                assigneeProjectId: id === "none" ? null : (id as ProjectId),
              })
            }
          />
        </label>
      ) : null}
      <label className="flex flex-col gap-2 text-sm">
        Parent task
        <TaskSelect
          label="Parent task"
          value={value.parentTaskId ?? "none"}
          options={parentOptions}
          onChange={(id) =>
            onChange({
              parentTaskId: id === "none" ? null : (id as WorkTaskId),
            })
          }
        />
      </label>
    </div>
  );
}
function TaskAssigneeActivity({
  assignee,
  status,
  sidebar = false,
}: {
  assignee: ReactNode;
  status: WorkTaskStatus;
  sidebar?: boolean;
}) {
  const activity = taskActivity(status);
  return (
    <span
      className={cn(
        "flex flex-wrap items-center text-sm text-muted-foreground",
        sidebar ? "gap-2" : "gap-1",
      )}
    >
      <span className={cn("min-w-0 text-foreground", !sidebar && "font-semibold")}>{assignee}</span>
      <span className={sidebar ? "ml-auto" : undefined}>
        {sidebar ? activity.label : activity.description}
      </span>
    </span>
  );
}
function TaskEditor({
  task,
  environmentId,
  initialRevision,
  assignee,
  subtasks,
  onOpenSubtask,
  onAddSubtask,
  projectOptions,
  agentOptions,
  parentOptions,
  panelOpen,
  onPanelChange,
  panelAnchor,
  onSave,
  onDelete,
}: {
  task: WorkTask;
  environmentId: EnvironmentId;
  initialRevision: number;
  assignee?: ReactNode;
  subtasks: WorkTaskSummary[];
  onOpenSubtask: (task: WorkTaskSummary, newTab?: boolean) => void;
  onAddSubtask: () => void;
  projectOptions: { value: string; label: ReactNode }[];
  agentOptions: { value: string; label: ReactNode }[];
  parentOptions: { value: string; label: ReactNode }[];
  panelOpen: boolean;
  onPanelChange: (open: boolean) => void;
  panelAnchor: RefObject<Element | null>;
  onSave: (input: WorkTaskSaveInput) => Promise<WorkTask>;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [ready, setReady] = useState(task.revision >= initialRevision);
  const initializing = useRef(!ready);
  const [subtasksOpen, setSubtasksOpen] = useState(true);
  const [responseOpen, setResponseOpen] = useState(false);
  const completedSubtasks = subtasks.filter((task) => task.status === "done").length;
  const [error, setError] = useState<string | null>(null);
  const [conflicted, setConflicted] = useState(false);
  const saved = useRef(task);
  const draft = useRef({ title, description });
  const submitting = useRef<Promise<boolean> | null>(null);
  if (!ready && task.revision >= initialRevision) {
    setTitle(task.title);
    setDescription(task.description);
    setReady(true);
  }
  useEffect(() => {
    draft.current = { title, description };
  }, [title, description]);
  useEffect(() => {
    if (initializing.current) {
      if (task.revision < initialRevision) return;
      saved.current = task;
      draft.current = { title: task.title, description: task.description };
      initializing.current = false;
      return;
    }
    if (task.revision <= saved.current.revision) return;
    const old = saved.current;
    if (
      (draft.current.title !== old.title && task.title !== old.title) ||
      (draft.current.description !== old.description && task.description !== old.description)
    ) {
      setError(
        "This task has newer edits. Your draft is preserved. Reload the latest version to continue.",
      );
      setConflicted(true);
      return;
    }
    setTitle((value) => (value === old.title ? task.title : value));
    setDescription((value) => (value === old.description ? task.description : value));
    saved.current = task;
  }, [task, initialRevision]);
  const flush = useCallback(
    async function flush(): Promise<boolean> {
      if (submitting.current) {
        if (!(await submitting.current)) return false;
        return flush();
      }
      const current = draft.current;
      const baseline = saved.current;
      if (current.title === baseline.title && current.description === baseline.description)
        return true;
      if (!current.title.trim()) {
        setError("A task title is required.");
        return false;
      }
      submitting.current = onSave({
        id: task.id,
        expectedRevision: baseline.revision,
        ...(current.title !== baseline.title ? { title: current.title } : {}),
        ...(current.description !== baseline.description
          ? { description: current.description }
          : {}),
      })
        .then((updated) => {
          saved.current = updated;
          setError(null);
          return true;
        })
        .catch((error: unknown) => {
          setError(
            error instanceof Error
              ? error.message
              : "Could not save task. Your draft is preserved.",
          );
          return false;
        });
      const result = await submitting.current;
      submitting.current = null;
      if (
        result &&
        (draft.current.title !== saved.current.title ||
          draft.current.description !== saved.current.description)
      )
        return flush();
      return result;
    },
    [onSave, task.id],
  );
  useEffect(() => {
    if (error || (title === saved.current.title && description === saved.current.description))
      return;
    const timer = setTimeout(() => void flush(), 500);
    return () => clearTimeout(timer);
  }, [title, description, error, flush]);
  useBlocker({
    shouldBlockFn: async () => !(await flush()),
    enableBeforeUnload: () =>
      title !== saved.current.title || description !== saved.current.description,
  });
  const save = (patch: WorkTaskSaveInput) => {
    void flush().then(async (ok) => {
      if (!ok) return;
      try {
        saved.current = await onSave({
          id: task.id,
          expectedRevision: saved.current.revision,
          ...patch,
        });
      } catch (error) {
        report(error);
      }
    });
  };
  if (!ready) return <p className="text-sm text-muted-foreground">Loading task…</p>;
  return (
    <div className="relative flex min-w-0 items-start gap-6">
      <div className="min-w-0 flex-1">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
          <input
            aria-label="Task title"
            maxLength={200}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(null);
            }}
            onBlur={() => void flush()}
            className="w-full bg-transparent text-2xl font-medium text-foreground outline-none focus-visible:outline-2 focus-visible:outline-ring"
          />
          {assignee ? (
            <div className="flex flex-col gap-3">
              {task.startedThreadId ? (
                <button
                  type="button"
                  aria-label="Agent task response"
                  aria-expanded={responseOpen}
                  onClick={() => setResponseOpen(!responseOpen)}
                  className="flex w-fit items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {responseOpen ? (
                    <ChevronDownIcon className="size-4" />
                  ) : (
                    <ChevronRightIcon className="size-4" />
                  )}
                  <TaskAssigneeActivity assignee={assignee} status={task.status} />
                </button>
              ) : (
                <TaskAssigneeActivity assignee={assignee} status={task.status} />
              )}
            </div>
          ) : null}
          <WorkspaceRichTextEditor
            label="Task"
            value={taskEditorContent(description)}
            onChange={(content) => {
              setDescription(content);
              setError(null);
            }}
          />
          {responseOpen && task.startedThreadId ? (
            <div className="border-t border-border pt-5">
              <TaskAgentResponse
                environmentId={environmentId}
                threadId={task.startedThreadId}
                taskId={task.id}
                taskTitle={title}
              />
            </div>
          ) : null}
          {!task.parentTaskId ? (
            <section
              aria-label="Subtasks"
              className="mt-3 overflow-hidden rounded-lg border border-border bg-card/20"
            >
              <div className="relative flex h-12 items-center gap-3 px-4">
                <button
                  type="button"
                  aria-expanded={subtasksOpen}
                  onClick={() => setSubtasksOpen(!subtasksOpen)}
                  className="flex items-center gap-3 text-sm font-medium"
                >
                  {subtasksOpen ? (
                    <ChevronDownIcon className="size-4" />
                  ) : (
                    <ChevronRightIcon className="size-4" />
                  )}
                  Subtasks
                </button>
                <span className="text-xs text-muted-foreground">
                  {subtasks.length
                    ? `${completedSubtasks}/${subtasks.length} completed`
                    : "None yet"}
                </span>
                <div className="ml-auto">
                  <Button
                    variant="ghost-muted"
                    size="icon-xs"
                    aria-label="Add subtask"
                    onClick={onAddSubtask}
                  >
                    <PlusIcon />
                  </Button>
                </div>
                {subtasksOpen && subtasks.length ? (
                  <div className="absolute inset-x-4 bottom-0 h-0.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: `${(completedSubtasks / subtasks.length) * 100}%`,
                      }}
                    />
                  </div>
                ) : null}
              </div>
              {subtasksOpen ? (
                <div className="border-t border-border">
                  {subtasks.map((subtask) => (
                    <WorkspaceItemLink
                      key={subtask.id}
                      onOpen={(newTab) => onOpenSubtask(subtask, newTab)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        void showContextMenuFallback(
                          [{ id: "open-new-tab", label: "Open in new tab", icon: "open-new-tab" }],
                          { x: event.clientX, y: event.clientY },
                        )
                          .then((action) => {
                            if (action === "open-new-tab") onOpenSubtask(subtask, true);
                          })
                          .catch((error) => setError(String(error)));
                      }}
                      className="flex h-12 w-full cursor-pointer items-center gap-3 px-4 text-left text-sm hover:bg-sidebar-row-hover"
                    >
                      <TaskStatusIcon status={subtask.status} />
                      <span className="min-w-0 flex-1 truncate">{subtask.title}</span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        <TaskStatusIcon status={subtask.status} />
                        {TASK_STATUS_LABELS[subtask.status]}
                      </span>
                    </WorkspaceItemLink>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
          {error ? (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 text-sm text-destructive"
            >
              <p>{error}</p>
              {conflicted ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void ensureLocalApi()
                      .dialogs.confirm(
                        "Reload the latest task? This replaces your preserved local draft.",
                        { variant: "destructive" },
                      )
                      .then((confirmed) => {
                        if (!confirmed) return;
                        saved.current = task;
                        draft.current = {
                          title: task.title,
                          description: task.description,
                        };
                        setTitle(task.title);
                        setDescription(task.description);
                        setError(null);
                        setConflicted(false);
                      });
                  }}
                >
                  Reload latest
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => void flush()}>
                  Retry
                </Button>
              )}
            </div>
          ) : null}
          {task.startError ? (
            <p role="alert" className="text-sm text-destructive">
              {task.startError}
            </p>
          ) : null}
        </div>
      </div>
      <WorkspaceDetailsPanel
        label="Task details"
        open={panelOpen}
        onOpenChange={onPanelChange}
        anchor={panelAnchor}
      >
        <div className="flex flex-col gap-6">
          {assignee ? (
            <TaskAssigneeActivity assignee={assignee} status={task.status} sidebar />
          ) : null}
          <TaskProperties
            value={task}
            projectOptions={projectOptions}
            agentOptions={agentOptions}
            parentOptions={subtasks.length ? parentOptions.slice(0, 1) : parentOptions}
            onChange={save}
          />
          <dl className="flex flex-col gap-3 text-xs text-muted-foreground">
            {[
              ["Created", task.createdAt],
              ["Updated", task.updatedAt],
              ["Completed", task.completedAt],
            ].map(([label, date]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt>{label}</dt>
                <dd>{date ? formatCalendarDate(date) : "—"}</dd>
              </div>
            ))}
          </dl>
          <Button variant="outline" onClick={onDelete}>
            <Trash2Icon />
            Delete task
          </Button>
        </div>
      </WorkspaceDetailsPanel>
    </div>
  );
}
function TaskCreateDialog({
  open,
  onOpenChange,
  projectOptions,
  agentOptions,
  parentOptions,
  parentTaskId,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectOptions: { value: string; label: ReactNode }[];
  agentOptions: { value: string; label: ReactNode }[];
  parentOptions: { value: string; label: ReactNode }[];
  parentTaskId: WorkTaskId | null;
  onSave: (input: WorkTaskSaveInput) => Promise<void>;
}) {
  const [draft, setDraft] = useState<WorkTaskSaveInput>({
    title: "",
    description: "",
    status: "todo",
    parentTaskId,
    projectId: null,
    assigneeProjectId: null,
  });
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!saving) onOpenChange(value);
      }}
    >
      <DialogPopup className="max-w-2xl overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Add a title and description, then choose a status and optional project or agent.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            setSaving(true);
            void onSave(draft)
              .then(() =>
                setDraft({
                  title: "",
                  description: "",
                  status: "todo",
                  projectId: null,
                  assigneeProjectId: null,
                }),
              )
              .catch(report)
              .finally(() => setSaving(false));
          }}
        >
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 pt-5 pb-4">
            <p className="text-xs text-muted-foreground">New task</p>
            <input
              aria-label="New task title"
              placeholder="Task title"
              autoFocus
              required
              maxLength={200}
              value={draft.title ?? ""}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              className="w-full bg-transparent text-xl font-medium text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
            />
            <WorkspaceRichTextEditor
              label="New task"
              value={draft.description ?? ""}
              onChange={(description) => setDraft((draft) => ({ ...draft, description }))}
            />
            <div className="flex flex-wrap items-center gap-2">
              <TaskSelect
                compact
                label="Task status"
                value={draft.status ?? "todo"}
                options={statusOptions}
                onChange={(status) => setDraft({ ...draft, status: status as WorkTaskStatus })}
              />
              <TaskSelect
                compact
                icon={<FolderClosedIcon />}
                label="Task project"
                value={draft.projectId ?? "none"}
                options={projectOptions}
                onChange={(id) =>
                  setDraft({
                    ...draft,
                    projectId: id === "none" ? null : (id as ProjectId),
                  })
                }
              />
              {agentOptions.length > 1 ? (
                <TaskSelect
                  compact
                  label="Assigned agent or channel"
                  value={draft.assigneeProjectId ?? "none"}
                  options={agentOptions}
                  onChange={(id) =>
                    setDraft({
                      ...draft,
                      assigneeProjectId: id === "none" ? null : (id as ProjectId),
                    })
                  }
                />
              ) : null}
              <TaskSelect
                compact
                label="Parent task"
                value={draft.parentTaskId ?? "none"}
                options={parentOptions}
                onChange={(id) =>
                  setDraft({
                    ...draft,
                    parentTaskId: id === "none" ? null : (id as WorkTaskId),
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button variant="outline" type="submit" disabled={saving || !draft.title?.trim()}>
              {saving ? "Creating…" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function TaskStatusIcon({ status }: { status: WorkTaskStatus }) {
  const Icon = {
    backlog: CircleDashedIcon,
    todo: CircleIcon,
    in_progress: CircleDotIcon,
    done: CircleCheckIcon,
    canceled: CircleXIcon,
  }[status];
  return <Icon aria-hidden className="size-4 shrink-0" />;
}
function orderGroups(groups: TaskGroup[], order: string[]) {
  return groups.toSorted((a, b) => {
    const ai = order.indexOf(a.key),
      bi = order.indexOf(b.key);
    return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
  });
}

function taskEditorContent(description: string) {
  if (description.trimStart().startsWith("<")) return description;
  return description
    .split("\n")
    .map(
      (line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
    )
    .join("");
}

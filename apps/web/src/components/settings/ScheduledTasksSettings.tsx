import { useAtomValue } from "@effect/atom-react";
import { WebhookDeliveriesDialog } from "./ScheduledTaskWebhook";
import { scheduledTabKey, type ScheduledTabTarget } from "../../scheduledTabsStore";
import { useConversationTabsStore, type ConversationTab } from "../../conversationTabsStore";
import { ConversationTabs } from "../chat/ConversationTabs";
import { useConversationTabNavigation } from "../../hooks/useConversationTabNavigation";
import { useConversationRowClick } from "../../hooks/useConversationRowClick";
import {
  Clock3Icon,
  InboxIcon,
  MoreHorizontalIcon,
  Edit03Icon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  SquareArrowOutUpRightIcon,
} from "~/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  EnvironmentId,
  ScheduledTask,
  ScheduledTaskId,
  ScheduledTaskSchedule,
} from "@elysiatools/contracts";
import { SINGLE_PROVIDER_UI, resolveEnvironmentMachineKind } from "@elysiatools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@elysiatools/client-runtime/state/runtime";
import { formatRelativeTime } from "../../timestampFormat";
import { type EnvironmentPresentation } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { AuthOrchestrationOperateScope } from "@elysiatools/contracts";
import { readEnvironmentScope } from "~/state/session";
import { useSettingsScope } from "./SettingsScopeContext";
import { WEEKDAY_LABELS, matchesScheduledTaskScope } from "./scheduledTasksSettings.logic";
import { WorkspaceSidebarContent } from "../sidebar/WorkspaceSidebarContent";
import { SettingsScopeSentence } from "./SettingsScopeSentence";
import { CollectionSidebarHeader } from "../sidebar/CollectionSidebarHeader";
import { SidebarContent, SidebarGroup, useSidebar } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { cn } from "../../lib/utils";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from "../ui/menu";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "../ui/empty";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { stackedThreadToast, toastManager } from "../ui/toast";
import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
  useRelativeTimeTick,
} from "./settingsLayout";

import { ScheduledTaskEditor } from "./ScheduledTaskEditor";

export function scheduleLabel(schedule: ScheduledTaskSchedule): string {
  if (schedule.type === "webhook") return "On webhook";
  if (schedule.type === "interval") {
    const minutes = schedule.everyMs / 60_000;
    return Number.isInteger(minutes)
      ? `Every ${minutes} min`
      : `Every ${Math.round(schedule.everyMs / 1000)} sec`;
  }
  const weekdays = schedule.weekdays ?? [];
  const days =
    weekdays.length === 0
      ? "Daily"
      : weekdays.length === 5 && weekdays.every((day) => day >= 1 && day <= 5)
        ? "Weekdays"
        : weekdays.map((day) => WEEKDAY_LABELS[day]).join(", ");
  return `${days} at ${schedule.timeOfDay}`;
}

/**
 * Human label for a run timestamp. `formatRelativeTime` only handles the
 * past, and `nextRunAt` is a future instant — render "in 5m" style labels
 * for upcoming runs instead of a misleading "just now".
 */
export function relativeLabel(value: string | null): string {
  if (!value) return "Not scheduled";
  const diffMs = new Date(value).getTime() - Date.now();
  if (diffMs <= 0) {
    const relative = formatRelativeTime(value);
    if (!relative) return "Not scheduled";
    return relative.suffix ? `${relative.value} ${relative.suffix}` : relative.value;
  }
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 2) return "in under a minute";
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

function statusVariant(status: ScheduledTask["lastRunStatus"]) {
  if (status === "failed") return "error";
  if (status === "succeeded") return "success";
  if (status === "running") return "info";
  return "outline";
}

type ScheduledTasksTarget = {
  readonly environmentId?: EnvironmentId;
  readonly taskId?: ScheduledTaskId | undefined;
};

export function ScheduledTasksSettings(target: ScheduledTasksTarget) {
  return SINGLE_PROVIDER_UI ? (
    <ScheduledTasksWorkspace {...target} />
  ) : (
    <LegacyScheduledTasksSettings {...target} />
  );
}

function LegacyScheduledTasksSettings(target: ScheduledTasksTarget) {
  const { scope, environments, connectedEnvironments, environment } = useSettingsScope();
  const [editor, setEditor] = useState<{
    environmentId: EnvironmentId;
    task: ScheduledTask | null;
  } | null>(null);
  const openForEdit = useCallback((environmentId: EnvironmentId, task: ScheduledTask) => {
    setEditor({ environmentId, task });
  }, []);
  const defaultEnvironment = environment ?? connectedEnvironments[0];
  const canCreate = useAtomValue(
    serverEnvironment.upsertScheduledTask.permissionAtom(defaultEnvironment?.environmentId ?? null),
  );
  return (
    <SettingsPageContainer>
      <SettingsSection
        title="Scheduled"
        variant="plain"
        headerAction={
          <Button
            size="xs"
            variant="ghost-muted"
            disabled={!defaultEnvironment || !canCreate}
            onClick={() =>
              defaultEnvironment &&
              setEditor({ environmentId: defaultEnvironment.environmentId, task: null })
            }
          >
            <PlusIcon className="size-3" />
            New task
          </Button>
        }
      >
        {scope.kind === "unavailable" ? (
          <SettingsSection title="Unavailable selection">
            <SettingsRow title={scope.message} />
          </SettingsSection>
        ) : environments.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clock3Icon />
              </EmptyMedia>
              <EmptyTitle>No environments available</EmptyTitle>
              <EmptyDescription>Connect an environment to manage scheduled tasks.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-8">
            {environments.map((entry) => (
              <ScheduledTaskEnvironmentSection
                key={`${entry.environmentId}:${target.taskId ?? ""}`}
                environment={entry}
                showEnvironmentHeading={environments.length > 1}
                taskId={
                  (target.environmentId ?? defaultEnvironment?.environmentId) ===
                  entry.environmentId
                    ? target.taskId
                    : undefined
                }
                onEdit={openForEdit}
              />
            ))}
          </div>
        )}
      </SettingsSection>
      {editor ? (
        <ScheduledTaskEditor
          key={`${editor.environmentId}:${editor.task?.id ?? "new"}`}
          initialEnvironmentId={editor.environmentId}
          task={editor.task}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </SettingsPageContainer>
  );
}

function ScheduledTasksWorkspace(target: ScheduledTasksTarget) {
  const [search, setSearch] = useState("");
  const { scope, environments, connectedEnvironments, environment } = useSettingsScope();
  const { isMobile, setOpenMobile, setOpen } = useSidebar();
  const desktopHeader = useMediaQuery("(min-width: 768px)");
  const navigateTab = useConversationTabNavigation();
  const state = useConversationTabsStore();
  const tabs = state.tabs.filter(
    (
      tab,
    ): tab is ConversationTab & {
      target: Extract<ConversationTab["target"], { kind: "scheduled" }>;
    } => tab.target.kind === "scheduled",
  );
  const { activeId, close } = state;
  const open = useCallback((selection: ScheduledTabTarget, newTab = false) => {
    const store = useConversationTabsStore.getState();
    const active = store.tabs.find((tab) => tab.id === store.activeId);
    store.open({ kind: "scheduled", selection }, newTab || active?.target.kind !== "scheduled");
  }, []);
  const retarget = (previous: ScheduledTabTarget, selection: ScheduledTabTarget) =>
    state.retarget({ kind: "scheduled", selection: previous }, { kind: "scheduled", selection });
  const activeTab = tabs.find((tab) => tab.id === activeId);
  const editor = activeTab?.target.selection.kind === "task" ? activeTab.target.selection : null;
  useEffect(() => {
    const store = useConversationTabsStore.getState();
    if (store.tabs.find((tab) => tab.id === store.activeId)?.target.kind === "scheduled") return;
    const existing = store.tabs.toReversed().find((tab) => tab.target.kind === "scheduled");
    if (existing) store.activate(existing.id);
    else open({ kind: "empty" });
  }, [open]);
  const defaultEnvironment = environment ?? connectedEnvironments[0];
  const linkedEnvironment = environments.find(
    (entry) => entry.environmentId === (target.environmentId ?? defaultEnvironment?.environmentId),
  );
  const linkedTasks = useEnvironmentQuery(
    target.taskId &&
      linkedEnvironment?.connection.phase === "connected" &&
      linkedEnvironment.serverConfig
      ? serverEnvironment.scheduledTasksLive({
          environmentId: linkedEnvironment.environmentId,
          input: {},
        })
      : null,
  );
  const linkedTask = linkedTasks.data?.tasks.find(
    (task) =>
      task.id === target.taskId &&
      linkedEnvironment &&
      matchesScheduledTaskScope(scope, linkedEnvironment.environmentId, task.projectId),
  );
  const openedLink = useRef<string | null>(null);
  const openForEdit = useCallback(
    (environmentId: EnvironmentId, task: ScheduledTask, newTab = false) => {
      open({ kind: "task", environmentId, task }, newTab);
      if (isMobile) setOpenMobile(false);
    },
    [isMobile, setOpenMobile, open],
  );
  const createTask = () => {
    if (!defaultEnvironment) return;
    open({ kind: "task", environmentId: defaultEnvironment.environmentId, task: null });
    if (isMobile) setOpenMobile(false);
  };
  useEffect(() => {
    if (
      linkedTask &&
      linkedEnvironment &&
      openedLink.current !== `${linkedEnvironment.environmentId}:${linkedTask.id}`
    ) {
      openedLink.current = `${linkedEnvironment.environmentId}:${linkedTask.id}`;
      openForEdit(linkedEnvironment.environmentId, linkedTask);
    }
  }, [linkedTask, linkedEnvironment, openForEdit]);
  return (
    <>
      <WorkspaceSidebarContent>
        <CollectionSidebarHeader
          title="Scheduled"
          query={search}
          onQueryChange={setSearch}
          actions={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Create scheduled task"
              disabled={!defaultEnvironment}
              onClick={createTask}
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
          {scope.kind === "unavailable" ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Choose another project or agent to view its tasks.
            </p>
          ) : environments.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Reconnect Elysia to view scheduled tasks.
            </p>
          ) : (
            environments.map((entry) => (
              <ScheduledTaskEnvironmentSection
                key={`${entry.environmentId}:${target.taskId ?? ""}`}
                environment={entry}
                showEnvironmentHeading={false}
                taskId={
                  (target.environmentId ?? defaultEnvironment?.environmentId) ===
                  entry.environmentId
                    ? target.taskId
                    : undefined
                }
                onEdit={openForEdit}
                onEditInNewTab={(environmentId, task) => openForEdit(environmentId, task, true)}
                compact
                search={search}
                selectedTaskId={
                  editor?.environmentId === entry.environmentId ? editor.task?.id : undefined
                }
              />
            ))
          )}
        </SidebarContent>
      </WorkspaceSidebarContent>
      {!desktopHeader && (
        <WorkspacePageHeader>
          <ConversationTabs />
        </WorkspacePageHeader>
      )}
      {tabs.map((tab) => (
        <div
          key={`${tab.id}:${scheduledTabKey(tab.target.selection)}`}
          className={cn("min-h-0 flex-1 flex-col", tab.id === activeId ? "flex" : "hidden")}
        >
          {tab.target.selection.kind === "task" ? (
            <ScheduledTaskEditor
              initialEnvironmentId={tab.target.selection.environmentId}
              task={tab.target.selection.task}
              onSaved={(environmentId, task) =>
                retarget(tab.target.selection, { kind: "task", environmentId, task })
              }
              onClose={() => {
                if (state.tabs[0]?.id === tab.id) retarget(tab.target.selection, { kind: "empty" });
                else {
                  const next = close(tab.id);
                  if (next) void navigateTab(next);
                }
              }}
              inline
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <Clock3Icon className="size-8 text-muted-foreground" />
              <h2 className="text-base font-medium">
                {target.taskId && linkedTasks.data && !linkedTask
                  ? "Task unavailable"
                  : "Choose a scheduled task"}
              </h2>
              <p className="text-sm text-muted-foreground">
                Select a task from the sidebar to edit it, or create a new task.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => (isMobile ? setOpenMobile(true) : setOpen(true))}
              >
                Show tasks
              </Button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

export function ScheduledTaskEnvironmentSection({
  environment,
  showEnvironmentHeading,
  taskId,
  onEdit,
  onEditInNewTab,
  compact = false,
  selectedTaskId,
  search = "",
}: {
  readonly onEditInNewTab?:
    | ((environmentId: EnvironmentId, task: ScheduledTask) => void)
    | undefined;
  readonly compact?: boolean;
  readonly search?: string;
  readonly selectedTaskId?: ScheduledTaskId | undefined;
  readonly environment: EnvironmentPresentation;
  readonly showEnvironmentHeading: boolean;
  readonly taskId?: ScheduledTaskId | undefined;
  readonly onEdit: (environmentId: EnvironmentId, task: ScheduledTask) => void;
}) {
  const { scope } = useSettingsScope();
  const connected =
    environment.connection.phase === "connected" && environment.serverConfig !== null;
  const tasksQuery = useEnvironmentQuery(
    connected
      ? serverEnvironment.scheduledTasksLive({
          environmentId: environment.environmentId,
          input: {},
        })
      : null,
  );
  const tasks = tasksQuery.data?.tasks.filter(
    (task) =>
      matchesScheduledTaskScope(scope, environment.environmentId, task.projectId) &&
      task.title.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const linkedTask = tasksQuery.data?.tasks.find((task) => task.id === taskId);
  const openedLink = useRef(false);
  useEffect(() => {
    if (!compact && !openedLink.current && linkedTask) {
      openedLink.current = true;
      onEdit(environment.environmentId, linkedTask);
    }
  }, [compact, environment.environmentId, linkedTask, onEdit]);
  useRelativeTimeTick(60_000);
  const rows = (
    <>
      {!connected ? (
        compact ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            Reconnect Elysia to view its tasks.
          </p>
        ) : (
          <SettingsRow
            title="Environment disconnected"
            description={`Reconnect ${environment.label} to view its scheduled tasks.`}
          />
        )
      ) : tasksQuery.error ? (
        compact ? (
          <p role="status" className="px-3 py-2 text-sm text-destructive">
            {tasksQuery.error}
          </p>
        ) : (
          <SettingsRow title="Could not load scheduled tasks" description={tasksQuery.error} />
        )
      ) : !tasks ? (
        compact ? (
          <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
            Loading scheduled tasks…
          </p>
        ) : (
          <SettingsRow title="Loading scheduled tasks…" role="status" />
        )
      ) : (
        <>
          {taskId && !linkedTask ? (
            compact ? (
              <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
                This task no longer exists or is outside this selection.
              </p>
            ) : (
              <SettingsRow
                title="Task unavailable"
                description="This task no longer exists or is outside the selected project scope."
                role="status"
              />
            )
          ) : null}
          {tasks.length === 0 ? (
            compact ? (
              <p className="px-2.5 py-2 text-sm text-muted-foreground">No scheduled tasks</p>
            ) : (
              <SettingsRow
                title="No scheduled tasks"
                description="No tasks match this environment and project selection."
              />
            )
          ) : (
            tasks.map((task) => (
              <ScheduledTaskRow
                key={task.id}
                environmentId={environment.environmentId}
                task={task}
                onEdit={() => onEdit(environment.environmentId, task)}
                onEditInNewTab={
                  onEditInNewTab ? () => onEditInNewTab(environment.environmentId, task) : undefined
                }
                compact={compact}
                selected={task.id === selectedTaskId}
              />
            ))
          )}
        </>
      )}
    </>
  );
  return compact ? (
    <section aria-label="Scheduled tasks" className="space-y-1 px-2">
      {rows}
    </section>
  ) : (
    <SettingsSection
      title={environment.label}
      hideTitle={!showEnvironmentHeading}
      icon={
        <EnvironmentMachineIcon
          kind={resolveEnvironmentMachineKind(environment.serverConfig)}
          className="size-3.5"
        />
      }
    >
      {rows}
    </SettingsSection>
  );
}

function ScheduledTaskRow({
  environmentId,
  task,
  onEdit,
  onEditInNewTab,
  compact = false,
  selected = false,
}: {
  readonly environmentId: EnvironmentId;
  readonly compact?: boolean;
  readonly selected?: boolean;
  readonly task: ScheduledTask;
  readonly onEdit: () => void;
  readonly onEditInNewTab?: (() => void) | undefined;
}) {
  const conversationClick = useConversationRowClick(onEdit, onEditInNewTab ?? onEdit);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextPoint, setContextPoint] = useState<{ x: number; y: number } | null>(null);
  const alreadyOpen = useConversationTabsStore((state) =>
    state.isOpen({ kind: "scheduled", selection: { kind: "task", environmentId, task } }),
  );
  const canOperate = useAtomValue(
    serverEnvironment.upsertScheduledTask.permissionAtom(environmentId),
  );
  const [deliveriesOpen, setDeliveriesOpen] = useState(false);
  const isWebhook = task.schedule.type === "webhook";
  const toggle = useAtomCommand(serverEnvironment.setScheduledTaskEnabled, {
    label: "scheduled task enabled",
  });
  const run = useAtomCommand(serverEnvironment.runScheduledTaskNow, {
    label: "scheduled task run now",
  });
  const remove = useAtomCommand(serverEnvironment.deleteScheduledTask, {
    label: "scheduled task delete",
  });
  const act = async (action: "toggle" | "run" | "delete") => {
    if (busy || !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)) return;
    setBusy(true);
    const result =
      action === "toggle"
        ? await toggle({ environmentId, input: { id: task.id, enabled: !task.enabled } })
        : action === "run"
          ? await run({ environmentId, input: { id: task.id } })
          : await remove({ environmentId, input: { id: task.id } });
    setBusy(false);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not update scheduled task",
          description: String(squashAtomCommandFailure(result)),
        }),
      );
    }
  };
  const controls = (
    <>
      <div className="flex items-center gap-2">
        {!compact && (
          <Switch
            checked={task.enabled}
            disabled={busy || !canOperate}
            aria-label={`Enable ${task.title}`}
            onCheckedChange={() => void act("toggle")}
          />
        )}
        <Menu
          open={menuOpen}
          onOpenChange={(value) => {
            setMenuOpen(value);
            if (!value) setContextPoint(null);
          }}
        >
          <MenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={busy || !canOperate}
                aria-label={`Actions for ${task.title}`}
              />
            }
          >
            <MoreHorizontalIcon className="size-4" />
          </MenuTrigger>
          <MenuPopup
            align={contextPoint ? "start" : "end"}
            anchor={
              contextPoint
                ? {
                    getBoundingClientRect: () => new DOMRect(contextPoint.x, contextPoint.y, 0, 0),
                  }
                : undefined
            }
          >
            {SINGLE_PROVIDER_UI && onEditInNewTab && !alreadyOpen ? (
              <MenuItem onClick={onEditInNewTab}>
                <SquareArrowOutUpRightIcon />
                Open in new tab
              </MenuItem>
            ) : null}
            <MenuItem onClick={onEdit}>
              <Edit03Icon />
              Edit
            </MenuItem>
            {isWebhook ? (
              <MenuItem onClick={() => setDeliveriesOpen(true)}>
                <InboxIcon />
                Deliveries
              </MenuItem>
            ) : (
              <MenuItem onClick={() => void act("run")}>
                <PlayIcon />
                Run now
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem onClick={() => void act("delete")}>
              <Trash2Icon />
              Delete
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
      {deliveriesOpen ? (
        <WebhookDeliveriesDialog
          environmentId={environmentId}
          task={task}
          onClose={() => setDeliveriesOpen(false)}
        />
      ) : null}
    </>
  );
  if (compact)
    return (
      <div
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (busy) return;
          setContextPoint({ x: event.clientX, y: event.clientY });
          setMenuOpen(true);
        }}
        className={cn(
          "flex min-w-0 items-center gap-1 rounded-xl px-2.5 py-1 hover:bg-sidebar-row-hover",
          selected && "bg-sidebar-row-active hover:bg-sidebar-row-active",
        )}
      >
        <button
          type="button"
          aria-label={`Edit ${task.title}`}
          aria-current={selected ? "true" : undefined}
          {...conversationClick}
          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="truncate text-sm font-medium">{task.title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {task.enabled ? scheduleLabel(task.schedule) : "Paused"}
          </span>
          {task.lastRunStatus !== "never" ? (
            <span
              className={cn(
                "text-xs text-muted-foreground",
                task.lastRunStatus === "failed" && "text-destructive",
              )}
            >
              {task.lastRunError ?? task.lastRunStatus}
            </span>
          ) : null}
        </button>
        {controls}
      </div>
    );
  return (
    <SettingsRow
      title={task.title}
      description={<span className="line-clamp-2">{task.prompt}</span>}
      status={
        <div className="flex flex-wrap items-center gap-2">
          <span>
            {scheduleLabel(task.schedule)} ·{" "}
            {!task.enabled
              ? "Paused"
              : isWebhook
                ? "Listening"
                : task.nextRunAt
                  ? `Next run ${relativeLabel(task.nextRunAt)}`
                  : "Not scheduled"}
          </span>
          {task.lastRunStatus !== "never" ? (
            <Badge variant={statusVariant(task.lastRunStatus)}>{task.lastRunStatus}</Badge>
          ) : null}
          {task.lastRunError ? <span className="text-destructive">{task.lastRunError}</span> : null}
        </div>
      }
      control={controls}
    />
  );
}

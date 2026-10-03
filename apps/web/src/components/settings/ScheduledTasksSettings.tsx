import { useAppTopbarHost } from "../AppTopbar";
import {
  Clock3Icon,
  MoreHorizontalIcon,
  Edit03Icon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from "~/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  EnvironmentId,
  ScheduledTask,
  ScheduledTaskId,
  ScheduledTaskSchedule,
} from "@t3tools/contracts";
import { SINGLE_PROVIDER_UI, resolveEnvironmentMachineKind } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { formatRelativeTime } from "../../timestampFormat";
import { type EnvironmentPresentation } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { useSettingsScope } from "./SettingsScopeContext";
import { WEEKDAY_LABELS, matchesScheduledTaskScope } from "./scheduledTasksSettings.logic";
import { WorkspaceSidebarContent } from "../sidebar/WorkspaceSidebarContent";
import { SettingsScopeSentence } from "./SettingsScopeSentence";
import { SidebarContent, useSidebar } from "../ui/sidebar";
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
  return (
    <SettingsPageContainer>
      <SettingsSection
        title="Scheduled"
        variant="plain"
        headerAction={
          <Button
            size="xs"
            variant="ghost-muted"
            disabled={!defaultEnvironment}
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
  const { scope, environments, connectedEnvironments, environment } = useSettingsScope();
  const { isMobile, setOpenMobile, setOpen } = useSidebar();
  const desktopHeader = useMediaQuery("(min-width: 768px)");
  const headerHost = useAppTopbarHost();
  const [editor, setEditor] = useState<{
    environmentId: EnvironmentId;
    task: ScheduledTask | null;
  } | null>(null);
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
  const openedLink = useRef(false);
  const openForEdit = useCallback(
    (environmentId: EnvironmentId, task: ScheduledTask) => {
      setEditor({ environmentId, task });
      if (isMobile) setOpenMobile(false);
    },
    [isMobile, setOpenMobile],
  );
  const createTask = () => {
    if (!defaultEnvironment) return;
    setEditor({ environmentId: defaultEnvironment.environmentId, task: null });
    if (isMobile) setOpenMobile(false);
  };
  useEffect(() => {
    if (!openedLink.current && linkedTask && linkedEnvironment) {
      openedLink.current = true;
      openForEdit(linkedEnvironment.environmentId, linkedTask);
    }
  }, [linkedTask, linkedEnvironment, openForEdit]);
  const header = (
    <WorkspacePageHeader
      className={cn(
        "relative w-full",
        editor &&
          "md:before:absolute md:before:-left-px md:before:top-2 md:before:bottom-2 md:before:w-px md:before:bg-workspace-panel-border",
      )}
    >
      <h1 className="truncate text-sm font-medium">
        {editor?.task?.title ?? (editor ? "New task" : "")}
      </h1>
    </WorkspacePageHeader>
  );
  return (
    <>
      <WorkspaceSidebarContent>
        <div className="flex shrink-0 items-center justify-between px-3 py-2">
          <h2 className="pl-1.5 text-base font-medium">Scheduled</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="New task"
            disabled={!defaultEnvironment}
            onClick={createTask}
          >
            <PlusIcon />
          </Button>
        </div>
        <div className="min-w-0 shrink-0 px-3 pb-3">
          <SettingsScopeSentence compact />
        </div>
        <SidebarContent>
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
                compact
                selectedTaskId={
                  editor?.environmentId === entry.environmentId ? editor.task?.id : undefined
                }
              />
            ))
          )}
        </SidebarContent>
      </WorkspaceSidebarContent>
      {headerHost && desktopHeader ? createPortal(header, headerHost) : header}
      {editor ? (
        <ScheduledTaskEditor
          key={`${editor.environmentId}:${editor.task?.id ?? "new"}`}
          initialEnvironmentId={editor.environmentId}
          task={editor.task}
          onClose={() => setEditor(null)}
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
    </>
  );
}

function ScheduledTaskEnvironmentSection({
  environment,
  showEnvironmentHeading,
  taskId,
  onEdit,
  compact = false,
  selectedTaskId,
}: {
  readonly compact?: boolean;
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
  const tasks = tasksQuery.data?.tasks.filter((task) =>
    matchesScheduledTaskScope(scope, environment.environmentId, task.projectId),
  );
  const linkedTask = tasks?.find((task) => task.id === taskId);
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
              <p className="px-3 py-2 text-sm text-muted-foreground">No scheduled tasks</p>
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
  compact = false,
  selected = false,
}: {
  readonly environmentId: EnvironmentId;
  readonly compact?: boolean;
  readonly selected?: boolean;
  readonly task: ScheduledTask;
  readonly onEdit: () => void;
}) {
  const [busy, setBusy] = useState(false);
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
    if (busy) return;
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
    <div className="flex items-center gap-2">
      {!compact && (
        <Switch
          checked={task.enabled}
          disabled={busy}
          aria-label={`Enable ${task.title}`}
          onCheckedChange={() => void act("toggle")}
        />
      )}
      <Menu>
        <MenuTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={busy}
              aria-label={`Actions for ${task.title}`}
            />
          }
        >
          <MoreHorizontalIcon className="size-4" />
        </MenuTrigger>
        <MenuPopup align="end">
          <MenuItem onClick={onEdit}>
            <Edit03Icon />
            Edit
          </MenuItem>
          <MenuItem onClick={() => void act("run")}>
            <PlayIcon />
            Run now
          </MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => void act("delete")}>
            <Trash2Icon />
            Delete
          </MenuItem>
        </MenuPopup>
      </Menu>
    </div>
  );
  if (compact)
    return (
      <div
        className={cn(
          "flex min-w-0 items-center gap-1 rounded-xl px-2.5 py-1 hover:bg-sidebar-row-hover",
          selected && "bg-sidebar-row-active hover:bg-sidebar-row-active",
        )}
      >
        <button
          type="button"
          aria-label={`Edit ${task.title}`}
          aria-current={selected ? "true" : undefined}
          onClick={onEdit}
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
            {task.enabled
              ? task.nextRunAt
                ? `Next run ${relativeLabel(task.nextRunAt)}`
                : "Not scheduled"
              : "Paused"}
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

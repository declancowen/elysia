import { WebhookEndpointField } from "./ScheduledTaskWebhook";
import { DEFAULT_WEBHOOK_PROMPT } from "@elysiatools/client-runtime/scheduled-task-webhook";
import {
  AuthOrchestrationOperateScope,
  MAX_WEBHOOK_DELIVERY_AGE_MINUTES,
} from "@elysiatools/contracts";
import { readEnvironmentScope } from "../../state/session";
import { formatAgentMention } from "@elysiatools/shared/agentMentions";
import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@elysiatools/client-runtime/environment";
import { type ReactNode, useMemo, useRef, useState, useId } from "react";
import type {
  EnvironmentId,
  ModelSelection,
  ProjectId,
  ScheduledTask,
  ScheduledTaskId,
  ScheduledTaskSchedule,
  ScheduledTaskUpsertInput,
  ThreadId,
} from "@elysiatools/contracts";
import {
  MIN_SCHEDULED_TASK_INTERVAL_MS,
  CONNECTIONS_ENABLED,
  ProviderInstanceId,
  resolveEnvironmentMachineKind,
} from "@elysiatools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@elysiatools/client-runtime/state/runtime";
import { useCodeWorkspace, useEnvironmentSettings } from "../../hooks/useSettings";
import { getCustomModelOptionsByInstance } from "../../modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import { useEnvironment } from "../../state/environments";
import { useProjects, useThreadShell } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { WorktreeBaseBranchPicker } from "../WorktreeBaseBranchPicker";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { useSettingsScope } from "./SettingsScopeContext";
import {
  WEEKDAY_LABELS,
  WEBHOOK_SIGNATURE_DEFAULTS,
  scheduleFromDraft,
  matchesScheduledTaskScope,
  scheduledTaskDefaultModel,
  scheduledTaskWorkspaceStrategy,
  taskToDraft,
  type DraftState,
  type WorkspaceMode,
} from "./scheduledTasksSettings.logic";
import { Label } from "../ui/label";
import { ToggleGroup, Toggle } from "../ui/toggle-group";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { stackedThreadToast, toastManager } from "../ui/toast";

/** JS day-of-week (0 = Sunday) rendered Monday-first, matching how people read a week. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const WEEKDAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

const WORKSPACE_MODE_LABELS: Record<WorkspaceMode, string> = {
  worktree: "Create a new worktree",
  root: "Use the project checkout",
  existing_worktree: "Use a specific checkout",
};

const EMPTY_DRAFT: DraftState = {
  editingId: null,
  title: "",
  prompt: "",
  enabled: true,
  scheduleMode: "fixed",
  intervalMinutes: "15",
  timeOfDay: "09:00",
  weekdays: new Set([1, 2, 3, 4, 5]),
  projectId: "",
  threadId: "",
  workspaceMode: "worktree",
  baseRef: "main",
  startFromOrigin: true,
  existingWorktreePath: "",
  modelKey: "",
  runtimeMode: "full-access",
  interactionMode: "default",
  baseModelSelection: null,
  signatureEnabled: false,
  ...WEBHOOK_SIGNATURE_DEFAULTS,
  signatureSecret: "",
  maxDeliveryAgeMinutes: "",
};

/** Labelled field: a caption sitting above its control. */
function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string | undefined;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label className="flex items-baseline justify-between" htmlFor={htmlFor}>
        <span>{label}</span>
        {hint ? (
          <span className="font-normal text-2xs text-muted-foreground/80">{hint}</span>
        ) : null}
      </Label>
      {children}
    </div>
  );
}

function splitModelKey(value: string): ModelSelection | null {
  const index = value.indexOf(":");
  if (index <= 0 || index === value.length - 1) return null;
  return {
    instanceId: ProviderInstanceId.make(value.slice(0, index)),
    model: value.slice(index + 1),
  };
}

export function ScheduledTaskEditor({
  initialEnvironmentId,
  task,
  onClose,
  onSaved,
  inline = false,
}: {
  readonly initialEnvironmentId: EnvironmentId;
  readonly task: ScheduledTask | null;
  readonly onClose: () => void;
  readonly onSaved?: ((environmentId: EnvironmentId, task: ScheduledTask) => void) | undefined;
  readonly inline?: boolean;
}) {
  const formId = useId();
  const { scope, connectedEnvironments } = useSettingsScope();
  const codeWorkspace = useCodeWorkspace();
  const [environmentId, setEnvironmentId] = useState(initialEnvironmentId);
  const environment = useEnvironment(environmentId);
  const connected =
    environment?.connection.phase === "connected" && environment.serverConfig !== null;
  const tasksQuery = useEnvironmentQuery(
    connected ? serverEnvironment.scheduledTasksLive({ environmentId, input: {} }) : null,
  );
  const allProjects = useProjects();
  const projects = useMemo(
    () =>
      allProjects.filter(
        (project) =>
          project.environmentId === environmentId &&
          (inline || matchesScheduledTaskScope(scope, environmentId, project.id)),
      ),
    [allProjects, environmentId, inline, scope],
  );
  const settings = useEnvironmentSettings(environmentId);
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? EMPTY_SERVER_PROVIDERS;
  const upsertTask = useAtomCommand(serverEnvironment.upsertScheduledTask, {
    label: "scheduled task upsert",
  });
  const instanceEntries = useMemo(
    () =>
      sortProviderInstanceEntries(
        applyProviderInstanceSettings(deriveProviderInstanceEntries(providers), settings),
      ),
    [providers, settings],
  );
  const [draft, setDraft] = useState<DraftState>(() =>
    task
      ? taskToDraft(task)
      : {
          ...EMPTY_DRAFT,
          projectId:
            projects.find((project) => matchesScheduledTaskScope(scope, environmentId, project.id))
              ?.id ??
            projects[0]?.id ??
            "",
        },
  );
  const [saving, setSaving] = useState(false);
  const liveTask = task
    ? (tasksQuery.data?.tasks.find((entry) => entry.id === task.id) ?? task)
    : null;
  const canOperate = useAtomValue(
    serverEnvironment.upsertScheduledTask.permissionAtom(environmentId),
  );
  const submissionPending = useRef(false);
  const editingTaskMissing =
    draft.editingId !== null &&
    tasksQuery.data !== null &&
    !tasksQuery.data.tasks.some((entry) => entry.id === draft.editingId);
  const selectedProjectId =
    draft.projectId ||
    projects.find((project) => matchesScheduledTaskScope(scope, environmentId, project.id))?.id ||
    projects[0]?.id ||
    "";
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const agentProfile = selectedProject?.agentProfile;
  const agentThread = useThreadShell(
    agentProfile?.conversationThreadId
      ? scopeThreadRef(environmentId, agentProfile.conversationThreadId)
      : null,
  );
  const showWorkspaceControls = codeWorkspace && !agentProfile;

  // The real model picker is keyed by a `${instanceId}:${model}` string, which
  // is exactly how the draft stores its selection.
  const firstInstance = instanceEntries[0];
  const activeSelection =
    agentThread?.modelSelection ??
    (draft.modelKey
      ? splitModelKey(draft.modelKey)
      : scheduledTaskDefaultModel(settings, selectedProject ?? null, instanceEntries));
  const activeInstanceId =
    activeSelection?.instanceId ?? firstInstance?.instanceId ?? ("" as ProviderInstanceId);
  const activeModel = activeSelection?.model ?? "";
  const modelOptionsByInstance = useMemo(
    () => getCustomModelOptionsByInstance(settings, providers, activeInstanceId, activeModel),
    [settings, providers, activeInstanceId, activeModel],
  );

  const reportFailure = (title: string, error: unknown) => {
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title,
        description: error instanceof Error ? error.message : String(error),
      }),
    );
  };

  const submit = async () => {
    if (
      !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope) ||
      submissionPending.current ||
      saving ||
      editingTaskMissing ||
      !connected ||
      tasksQuery.data === null
    )
      return;
    const selection = activeSelection;
    if (agentProfile && (agentProfile.archived || !agentThread)) {
      reportFailure("Agent chat is unavailable", "Open the agent chat before scheduling a task.");
      return;
    }
    if (
      !draft.title.trim() ||
      !draft.prompt.trim() ||
      !projects.some((project) => project.id === selectedProjectId) ||
      selection === null
    ) {
      reportFailure("Scheduled task is incomplete", "Add a title, prompt, project, and model.");
      return;
    }
    const schedule = scheduleFromDraft(draft);
    if (schedule === null) {
      reportFailure(
        "Invalid age limit",
        `Enter whole minutes from 1 to ${MAX_WEBHOOK_DELIVERY_AGE_MINUTES}, or leave it blank.`,
      );
      return;
    }
    if (
      schedule.type === "webhook" &&
      schedule.signature &&
      (!schedule.signature.header ||
        (!schedule.signature.secret &&
          !(liveTask?.schedule.type === "webhook" && liveTask.webhook?.hasSecret)))
    ) {
      reportFailure("Signing secret is required", "Enter the signature header and secret.");
      return;
    }

    if (
      schedule.type === "interval" &&
      (!Number.isSafeInteger(schedule.everyMs) || schedule.everyMs < MIN_SCHEDULED_TASK_INTERVAL_MS)
    ) {
      reportFailure("Invalid interval", "Enter an interval of at least one minute.");
      return;
    }
    if (
      showWorkspaceControls &&
      draft.workspaceMode === "existing_worktree" &&
      !draft.existingWorktreePath.trim()
    ) {
      reportFailure("Checkout path is required", "Enter the path of the checkout to run in.");
      return;
    }
    // Keep the original selection object (with provider options) when the
    // picker still points at the same instance+model.
    const modelSelection =
      agentThread?.modelSelection ??
      (draft.baseModelSelection !== null &&
      draft.baseModelSelection.instanceId === selection.instanceId &&
      draft.baseModelSelection.model === selection.model
        ? draft.baseModelSelection
        : selection);
    const workspaceStrategy = scheduledTaskWorkspaceStrategy(draft, showWorkspaceControls);
    const input: ScheduledTaskUpsertInput = {
      ...(draft.editingId ? { id: draft.editingId as ScheduledTaskId, requireExisting: true } : {}),
      title: draft.title.trim(),
      prompt: draft.prompt.trim(),
      enabled: draft.enabled,
      schedule,
      projectId: selectedProjectId as ProjectId,
      threadId: agentThread?.id ?? (draft.threadId ? (draft.threadId as ThreadId) : null),
      workspaceStrategy,
      modelSelection,
      runtimeMode: agentThread?.runtimeMode ?? draft.runtimeMode,
      interactionMode: agentThread?.interactionMode ?? draft.interactionMode,
      creationSource: "web",
    };
    // Lock before React renders, and keep successful creates locked until the form closes.
    submissionPending.current = true;
    setSaving(true);
    const result = await upsertTask({ environmentId, input });
    setSaving(false);
    if (result._tag === "Failure") {
      submissionPending.current = false;
      if (!isAtomCommandInterrupted(result)) {
        reportFailure("Could not save scheduled task", squashAtomCommandFailure(result));
      }
      return;
    }
    if (onSaved) {
      setDraft(taskToDraft(result.value.task));
      submissionPending.current = false;
      onSaved(environmentId, result.value.task);
    } else {
      onClose();
    }
  };

  const fields = (
    <fieldset disabled={saving || !canOperate} className="space-y-5">
      {!connected ? (
        <p className="text-sm text-destructive">Reconnect this environment before saving.</p>
      ) : null}
      {CONNECTIONS_ENABLED && (
        <Field label="Runs on" htmlFor={`${formId}-scheduled-task-environment`}>
          <Select
            value={environmentId}
            disabled={task !== null || saving}
            onValueChange={(id) => {
              const next = connectedEnvironments.find((entry) => entry.environmentId === id);
              if (!next) return;
              setEnvironmentId(next.environmentId);
              setDraft((current) => ({
                ...current,
                projectId: "",
                modelKey: "",
                baseModelSelection: null,
                baseRef: "main",
                startFromOrigin: true,
                existingWorktreePath: "",
              }));
            }}
          >
            <SelectTrigger id={`${formId}-scheduled-task-environment`} size="sm">
              <SelectValue>
                <span className="flex items-center gap-2">
                  <EnvironmentMachineIcon
                    kind={resolveEnvironmentMachineKind(environment?.serverConfig ?? null)}
                    className="size-4"
                  />
                  {environment?.label ?? "Unavailable environment"}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {connectedEnvironments.map((entry) => (
                <SelectItem key={entry.environmentId} value={entry.environmentId}>
                  <EnvironmentMachineIcon
                    kind={resolveEnvironmentMachineKind(entry.serverConfig)}
                    className="size-4"
                  />
                  {entry.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </Field>
      )}
      {tasksQuery.error ? (
        <p className="text-sm text-destructive" role="status">
          {tasksQuery.error}
        </p>
      ) : null}
      {editingTaskMissing ? (
        <p className="text-xs text-destructive" role="status">
          This scheduled task no longer exists.
        </p>
      ) : null}
      <Field label="Name" htmlFor={`${formId}-scheduled-task-title`}>
        <Input
          id={`${formId}-scheduled-task-title`}
          placeholder="e.g. Check for Sentry issues"
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
        />
      </Field>

      <div className={showWorkspaceControls ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>
        <Field label="Project, agent or channel" htmlFor={`${formId}-scheduled-task-project`}>
          <Select
            value={selectedProjectId}
            onValueChange={(projectId) =>
              setDraft((current) => ({
                ...current,
                projectId: projectId ?? "",
                threadId: "",
              }))
            }
          >
            <SelectTrigger size="sm" id={`${formId}-scheduled-task-project`}>
              <SelectValue placeholder="Select a project">{selectedProject?.title}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.title}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </Field>

        {showWorkspaceControls && (
          <Field label="Workspace" htmlFor={`${formId}-scheduled-task-workspace`}>
            <Select
              value={draft.workspaceMode}
              onValueChange={(value) =>
                setDraft((current) => ({ ...current, workspaceMode: value as WorkspaceMode }))
              }
            >
              <SelectTrigger size="sm" id={`${formId}-scheduled-task-workspace`}>
                <SelectValue>{WORKSPACE_MODE_LABELS[draft.workspaceMode]}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="worktree">Create a new worktree</SelectItem>
                <SelectItem value="root">Use the project checkout</SelectItem>
                <SelectItem value="existing_worktree">Use a specific checkout</SelectItem>
              </SelectPopup>
            </Select>
          </Field>
        )}
      </div>

      {showWorkspaceControls && draft.workspaceMode === "worktree" ? (
        <Field label="Base branch" htmlFor={`${formId}-scheduled-task-base-ref`}>
          <WorktreeBaseBranchPicker
            key={`${environmentId}:${selectedProjectId}`}
            id={`${formId}-scheduled-task-base-ref`}
            environmentId={environmentId}
            cwd={selectedProject?.workspaceRoot ?? null}
            value={draft.baseRef}
            onValueChange={(baseRef) => setDraft((current) => ({ ...current, baseRef }))}
            startFromOrigin={draft.startFromOrigin}
            onStartFromOriginChange={(startFromOrigin) =>
              setDraft((current) => ({ ...current, startFromOrigin }))
            }
            disabled={saving || !connected}
          />
        </Field>
      ) : null}
      {showWorkspaceControls && draft.workspaceMode === "existing_worktree" ? (
        <Field label="Checkout path" htmlFor={`${formId}-scheduled-task-checkout`}>
          <Input
            id={`${formId}-scheduled-task-checkout`}
            value={draft.existingWorktreePath}
            placeholder="/path/to/checkout"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                existingWorktreePath: event.target.value,
              }))
            }
          />
        </Field>
      ) : null}

      <Field
        label="Prompt"
        htmlFor={`${formId}-scheduled-task-prompt`}
        hint={agentProfile?.group ? "Runs through the lead agent" : undefined}
      >
        <Textarea
          id={`${formId}-scheduled-task-prompt`}
          className="max-h-64 overflow-y-auto"
          placeholder="What should the agent do each time this runs?"
          value={draft.prompt}
          onChange={(event) => setDraft((current) => ({ ...current, prompt: event.target.value }))}
        />
        {agentProfile ? (
          <div className="flex flex-wrap gap-1" aria-label="Mention agents">
            {allProjects
              .filter(
                (project) =>
                  project.environmentId === environmentId &&
                  project.agentProfile &&
                  !project.agentProfile.archived &&
                  !project.agentProfile.group &&
                  (!agentProfile.group || agentProfile.group.memberProjectIds.includes(project.id)),
              )
              .map((project) => (
                <Button
                  key={project.id}
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      prompt: `${current.prompt}${current.prompt ? " " : ""}${formatAgentMention(project.id, project.title)}`,
                    }))
                  }
                >
                  @{project.title}
                </Button>
              ))}
          </div>
        ) : null}
      </Field>

      {agentProfile?.group ? (
        <p className="text-sm text-muted-foreground">
          Channel members use their own selected models.
        </p>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <Label>Model</Label>
          <ProviderModelPicker
            disabled={Boolean(agentProfile) || saving || !connected}
            activeInstanceId={activeInstanceId}
            model={activeModel}
            lockedProvider={null}
            instanceEntries={instanceEntries}
            modelOptionsByInstance={modelOptionsByInstance}
            isComposerOwned={false}
            triggerVariant="outline"
            triggerAriaLabel="Scheduled task model"
            onInstanceModelChange={(instanceId, model) =>
              setDraft((current) => ({ ...current, modelKey: `${instanceId}:${model}` }))
            }
          />
        </div>
      )}

      <div className="space-y-3">
        {task?.schedule.type === "interval" &&
        task.schedule.everyMs < MIN_SCHEDULED_TASK_INTERVAL_MS ? (
          <p className="text-sm text-muted-foreground" role="status">
            This task uses a legacy interval below one minute. Saving updates it to at least one
            minute.
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <Label>Schedule</Label>
          <ToggleGroup
            aria-label="Schedule type"
            value={[draft.scheduleMode]}
            onValueChange={(values) => {
              const mode = values[0];
              if (mode === "fixed" || mode === "interval" || mode === "webhook")
                setDraft((current) => ({
                  ...current,
                  scheduleMode: mode,
                  prompt:
                    mode === "webhook" && !current.prompt.trim()
                      ? DEFAULT_WEBHOOK_PROMPT
                      : current.prompt,
                }));
            }}
          >
            <Toggle value="fixed">At a time</Toggle>
            <Toggle value="interval">Every interval</Toggle>
            <Toggle value="webhook">On webhook</Toggle>
          </ToggleGroup>
        </div>

        {draft.scheduleMode === "webhook" ? (
          <div className="space-y-4">
            <WebhookEndpointField environmentId={environmentId} task={liveTask} />
            <p className="text-xs text-muted-foreground">
              {
                "Each request runs the prompt. Use {{body.path}}, {{headers.name}}, {{query.name}}, {{body}} or {{request}} in the prompt; only what it names reaches the agent."
              }
            </p>
            <Field
              label="Skip requests older than"
              hint="minutes, optional"
              htmlFor={`${formId}-scheduled-task-max-age`}
            >
              <Input
                id={`${formId}-scheduled-task-max-age`}
                type="number"
                nativeInput
                min={1}
                max={MAX_WEBHOOK_DELIVERY_AGE_MINUTES}
                placeholder="Run every request"
                value={draft.maxDeliveryAgeMinutes}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    maxDeliveryAgeMinutes: event.target.value,
                  }))
                }
              />
            </Field>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <Label htmlFor={`${formId}-scheduled-task-signature`}>Require signature</Label>
                <p className="text-sm text-muted-foreground">
                  Reject requests without a valid HMAC-SHA256 signature of the body.
                </p>
              </div>
              <Switch
                id={`${formId}-scheduled-task-signature`}
                checked={draft.signatureEnabled}
                onCheckedChange={(signatureEnabled) =>
                  setDraft((current) => ({ ...current, signatureEnabled }))
                }
              />
            </div>
            {draft.signatureEnabled ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Header" htmlFor={`${formId}-scheduled-task-signature-header`}>
                  <Input
                    id={`${formId}-scheduled-task-signature-header`}
                    value={draft.signatureHeader}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        signatureHeader: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Prefix" htmlFor={`${formId}-scheduled-task-signature-prefix`}>
                  <Input
                    id={`${formId}-scheduled-task-signature-prefix`}
                    value={draft.signaturePrefix}
                    placeholder="None"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        signaturePrefix: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Encoding" htmlFor={`${formId}-scheduled-task-signature-encoding`}>
                  <Select
                    value={draft.signatureEncoding}
                    onValueChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        signatureEncoding: value === "base64" ? "base64" : "hex",
                      }))
                    }
                  >
                    <SelectTrigger size="sm" id={`${formId}-scheduled-task-signature-encoding`}>
                      <SelectValue>{draft.signatureEncoding}</SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="hex">hex</SelectItem>
                      <SelectItem value="base64">base64</SelectItem>
                    </SelectPopup>
                  </Select>
                </Field>
                <Field label="Secret" htmlFor={`${formId}-scheduled-task-signature-secret`}>
                  <Input
                    id={`${formId}-scheduled-task-signature-secret`}
                    type="password"
                    autoComplete="off"
                    value={draft.signatureSecret}
                    placeholder={
                      liveTask?.schedule.type === "webhook" && liveTask.webhook?.hasSecret
                        ? "Unchanged"
                        : "Shared secret"
                    }
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        signatureSecret: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>
            ) : null}
          </div>
        ) : draft.scheduleMode === "fixed" ? (
          <div className="flex items-center justify-between gap-4">
            <Label className="shrink-0" htmlFor={`${formId}-scheduled-task-time`}>
              Run at
            </Label>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  id={`${formId}-scheduled-task-time`}
                  nativeInput
                  className="w-32"
                  value={draft.timeOfDay}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, timeOfDay: event.target.value }))
                  }
                />
                <span className="text-xs text-muted-foreground">on</span>
              </div>
              <ToggleGroup
                multiple
                variant="outline"
                size="sm"
                aria-label="Days to run"
                value={[...draft.weekdays].map(String)}
                onValueChange={(values) => {
                  if (values.length === 0) return;
                  setDraft((current) => ({
                    ...current,
                    weekdays: new Set(values.map(Number)),
                  }));
                }}
              >
                {WEEKDAY_ORDER.map((day) => (
                  <Toggle key={day} value={String(day)} aria-label={WEEKDAY_LABELS[day]}>
                    {WEEKDAY_SHORT[day]}
                  </Toggle>
                ))}
              </ToggleGroup>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor={`${formId}-scheduled-task-interval`}>Run every</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                id={`${formId}-scheduled-task-interval`}
                nativeInput
                min={1}
                step="any"
                className="w-24"
                value={draft.intervalMinutes}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, intervalMinutes: event.target.value }))
                }
              />
              <span className="text-xs text-muted-foreground">minutes</span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={`${formId}-scheduled-task-enabled`}>Enabled</Label>
          <Switch
            id={`${formId}-scheduled-task-enabled`}
            aria-describedby={`${formId}-scheduled-task-enabled-description`}
            checked={draft.enabled}
            onCheckedChange={(enabled) => setDraft((current) => ({ ...current, enabled }))}
          />
        </div>
        <p
          id={`${formId}-scheduled-task-enabled-description`}
          className="text-sm text-muted-foreground/65"
        >
          Disabled tasks stay saved but do not run.
        </p>
      </div>
    </fieldset>
  );
  const actions = (
    <>
      <Button variant="outline" disabled={saving} onClick={onClose}>
        Cancel
      </Button>
      <Button
        variant="outline"
        disabled={!canOperate || saving || editingTaskMissing || !connected || !tasksQuery.data}
        onClick={() => void submit()}
      >
        {draft.editingId ? "Save task" : "Create task"}
      </Button>
    </>
  );
  const title = draft.editingId ? "Edit task" : "New task";
  const description = "Run a prompt automatically — on a schedule or when a webhook arrives.";
  if (inline)
    return (
      <section aria-label={title} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 pt-6 pb-12 sm:px-6">
          <header className="space-y-1">
            <h2 className="text-xl font-medium">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </header>
          {fields}
          <div className="flex justify-end gap-2">{actions}</div>
        </div>
      </section>
    );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogPanel>{fields}</DialogPanel>
        <DialogFooter>{actions}</DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

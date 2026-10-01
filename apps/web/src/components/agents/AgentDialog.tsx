import {
  DEFAULT_SERVER_SETTINGS,
  type AgentProfile,
  type ModelSelection,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { createModelSelection } from "@t3tools/shared/model";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { mergeEnvironmentSettings, useClientSettings } from "../../hooks/useSettings";
import { getCustomModelOptionsByInstance } from "../../modelSelection";
import {
  deriveProviderInstanceEntries,
  resolveDefaultProviderModelSelection,
} from "../../providerInstances";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useProject, useThreadShells } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { serverEnvironment } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { buildThreadRouteParams } from "../../threadRoutes";
import type { Project } from "../../types";
import { resolveSidebarThreadStatus } from "../Sidebar.logic";
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
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { type AgentAvatarValue } from "./AgentAvatar";
import { AgentAvatarPicker } from "./AgentAvatarPicker";
import { closeAgentDialog, useAgentDialogStore } from "./agentDialogStore";
import { saveAgentProfile } from "./agentProfileSave";

export function AgentDialogHost() {
  const target = useAgentDialogStore((state) => state.target);
  const project = useProject(target?.projectRef ?? null);
  if (!target) return null;
  if (target.projectRef && !project) {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) closeAgentDialog();
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Agent unavailable</DialogTitle>
            <DialogDescription>This agent is no longer available.</DialogDescription>
          </DialogHeader>
        </DialogPopup>
      </Dialog>
    );
  }
  return (
    <AgentEditor
      key={project ? `${project.environmentId}:${project.id}` : "new"}
      project={project}
    />
  );
}

function AgentEditor({ project }: { project: Project | null }) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environmentId = project?.environmentId ?? primaryEnvironmentId;
  const { environments } = useEnvironments();
  const environment = environments.find((entry) => entry.environmentId === environmentId);
  const server = environment?.serverConfig;
  const clientSettings = useClientSettings();
  const settings = useMemo(
    () => mergeEnvironmentSettings(server?.settings ?? DEFAULT_SERVER_SETTINGS, clientSettings),
    [server?.settings, clientSettings],
  );
  const providers = server?.providers ?? [];
  const [name, setName] = useState(project?.title ?? "");
  const [title, setTitle] = useState(project?.agentProfile?.title ?? "");
  const [instructions, setInstructions] = useState(project?.agentProfile?.instructions ?? "");
  const [avatar, setAvatar] = useState<AgentAvatarValue>(
    project?.agentProfile?.avatar ?? { preset: "robot", color: "#28B4FF" },
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    project?.agentProfile?.notificationsEnabled ?? true,
  );
  const [model, setModel] = useState<ModelSelection | null>(() =>
    resolveDefaultProviderModelSelection(
      providers,
      project?.defaultModelSelection ?? settings.defaultModelSelection,
    ),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createAgent = useAtomCommand(projectEnvironment.createAgent, { reportFailure: false });
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const stopSession = useAtomCommand(threadEnvironment.stopSession, { reportFailure: false });
  const updateThread = useAtomCommand(threadEnvironment.updateMetadata, { reportFailure: false });
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const threads = useThreadShells();
  const navigate = useNavigate();
  const entries = useMemo(
    () =>
      deriveProviderInstanceEntries(providers).filter(
        (entry) => entry.driverKind === "claudeAgent" && entry.enabled && entry.isAvailable,
      ),
    [providers],
  );
  const options = useMemo(
    () => getCustomModelOptionsByInstance(settings, providers, model?.instanceId, model?.model),
    [settings, providers, model?.instanceId, model?.model],
  );
  const modelAvailable =
    model !== null &&
    entries.some((entry) => entry.instanceId === model.instanceId) &&
    options
      .get(model.instanceId)
      ?.some((entry) => entry.slug === model.model && !entry.isUnavailable) === true;
  const ownedThreads = project
    ? threads.filter(
        (thread) => thread.environmentId === environmentId && thread.projectId === project.id,
      )
    : [];
  const busy = ownedThreads.some(
    (thread) => !["ready", "failed"].includes(resolveSidebarThreadStatus(thread)),
  );
  const browserEnabled = project
    ? resolveProjectSettings(settings, project.id, project, null).settings.enableAgentBrowserAccess
    : false;

  async function save() {
    if (
      !environmentId ||
      pending ||
      busy ||
      !name.trim() ||
      !instructions.trim() ||
      !model ||
      !modelAvailable
    )
      return;
    setPending(true);
    setError(null);
    const { title: _previousTitle, ...previousProfile } = project?.agentProfile ?? {};
    const agentProfile: AgentProfile = {
      ...previousProfile,
      instructions: instructions.trim(),
      ...(title.trim() ? { title: title.trim() } : {}),
      avatar,
      notificationsEnabled,
      archived: project?.agentProfile?.archived ?? false,
    };
    try {
      if (!project) {
        const result = await createAgent({
          environmentId,
          input: { name: name.trim(), agentProfile, defaultModelSelection: model },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        closeAgentDialog();
        await navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams(scopeThreadRef(environmentId, result.value.threadId)),
        });
      } else {
        await saveAgentProfile({
          project,
          threads: ownedThreads,
          name: name.trim(),
          profile: agentProfile,
          model,
          updateProject: async () => {
            const result = await updateProject({
              environmentId,
              input: {
                projectId: project.id,
                title: name.trim(),
                agentProfile,
                defaultModelSelection: model,
              },
            });
            if (result._tag === "Failure") throw squashAtomCommandFailure(result);
          },
          updateThreadModel: async (threadId, modelSelection) => {
            const result = await updateThread({
              environmentId,
              input: { threadId, modelSelection },
            });
            if (result._tag === "Failure") throw squashAtomCommandFailure(result);
          },
          stopSession: async (threadId) => {
            const result = await stopSession({ environmentId, input: { threadId } });
            if (result._tag === "Failure") throw squashAtomCommandFailure(result);
          },
        });
        closeAgentDialog();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this agent. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function setBrowserAccess(enabled: boolean) {
    if (!environmentId || !project || pending || busy) return;
    setPending(true);
    setError(null);
    const result = await updateSettings({
      environmentId,
      input: {
        patch: {
          projectSettingsOverrides: {
            ...settings.projectSettingsOverrides,
            [project.id]: {
              ...settings.projectSettingsOverrides[project.id],
              enableAgentBrowserAccess: enabled,
            },
          },
        },
      },
    });
    if (result._tag === "Failure") {
      const cause = squashAtomCommandFailure(result);
      setError(cause instanceof Error ? cause.message : "Could not save browser access.");
    }
    setPending(false);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) closeAgentDialog();
      }}
    >
      <DialogPopup>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <DialogHeader>
            <DialogTitle>{project ? "Edit agent" : "Create new agent"}</DialogTitle>
            <DialogDescription>
              Give your agent a role. It keeps its own conversation and memory.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <fieldset disabled={pending || busy} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Name</span>
                  <Input
                    autoFocus
                    value={name}
                    maxLength={200}
                    required
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Alex"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Role</span>
                  <Input
                    value={title}
                    maxLength={200}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Research assistant"
                  />
                </label>
              </div>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Instructions</span>
                <Textarea
                  rows={4}
                  value={instructions}
                  maxLength={32_000}
                  required
                  onChange={(event) => setInstructions(event.target.value)}
                  placeholder="Describe what this agent should help with and how it should work."
                />
              </label>
              <div className="space-y-1.5">
                <span className="text-sm font-medium">Default model</span>
                {model ? (
                  <ProviderModelPicker
                    activeInstanceId={model.instanceId}
                    model={model.model}
                    lockedProvider={entries[0]?.driverKind ?? null}
                    instanceEntries={entries}
                    modelOptionsByInstance={options}
                    isComposerOwned={false}
                    disabled={pending || busy}
                    triggerAriaLabel="Agent default model"
                    onInstanceModelChange={(instanceId, slug) =>
                      setModel(createModelSelection(instanceId, slug))
                    }
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Set up the Elysia CLI to choose a model.
                  </p>
                )}
              </div>
              <AgentAvatarPicker avatar={avatar} onChange={setAvatar} />
              <label className="flex items-center justify-between gap-4 text-sm">
                <span>Notifications</span>
                <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
              </label>
              {project ? (
                <label className="flex items-center justify-between gap-4 text-sm">
                  <span>Browser access</span>
                  <Switch
                    checked={browserEnabled}
                    onCheckedChange={(enabled) => {
                      void setBrowserAccess(enabled);
                    }}
                  />
                </label>
              ) : null}
            </fieldset>
            {busy ? (
              <p className="text-sm text-muted-foreground">
                Wait for the current task to finish before changing instructions.
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={closeAgentDialog}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                pending ||
                busy ||
                !name.trim() ||
                !instructions.trim() ||
                !modelAvailable ||
                environment?.connection.phase !== "connected"
              }
            >
              {pending ? "Saving…" : project ? "Save agent" : "Create agent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

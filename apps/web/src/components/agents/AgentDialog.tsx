import {
  DEFAULT_SERVER_SETTINGS,
  type AgentProfile,
  type ModelSelection,
  type ScopedProjectRef,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { createModelSelection } from "@t3tools/shared/model";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getAgentConversation } from "../../agentPresentation";
import { isElectron } from "../../env";
import { mergeEnvironmentSettings, useClientSettings } from "../../hooks/useSettings";
import { getCustomModelOptionsByInstance } from "../../modelSelection";
import {
  deriveProviderInstanceEntries,
  resolveDefaultProviderModelSelection,
} from "../../providerInstances";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import {
  useAllEnvironmentShellsBootstrapped,
  useProject,
  useThreadShells,
} from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { serverEnvironment } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { buildThreadRouteParams } from "../../threadRoutes";
import type { Project } from "../../types";
import { resolveSidebarThreadStatus } from "../Sidebar.logic";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { type AgentAvatarValue } from "./AgentAvatar";
import { AgentAvatarPicker } from "./AgentAvatarPicker";
import {
  closeAgentDialog,
  consumeAgentEditorIntent,
  useAgentDialogStore,
} from "./agentDialogStore";
import { saveAgentProfile } from "./agentProfileSave";

/** Preserve all existing editor entry points while opening a normal main-panel page. */
export function AgentDialogHost() {
  const target = useAgentDialogStore((state) => state.target);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (
      !target ||
      !consumeAgentEditorIntent(target, location.href, location.pathname === "/agents")
    )
      return;
    void navigate({
      to: "/agents",
      search: target.projectRef
        ? { environmentId: target.projectRef.environmentId, projectId: target.projectRef.projectId }
        : {},
    });
  }, [target, location.href, location.pathname, navigate]);
  return null;
}

function AgentPageFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <WorkspacePageHeader electron={isElectron} className="border-b border-border">
        <h1 className="text-sm font-medium text-foreground">{title}</h1>
      </WorkspacePageHeader>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </SidebarInset>
  );
}

export function AgentEditorPage({ projectRef }: { projectRef: ScopedProjectRef | null }) {
  const project = useProject(projectRef);
  const bootstrapped = useAllEnvironmentShellsBootstrapped();
  const returnHref = useAgentDialogStore((state) => state.returnHref);
  const navigate = useNavigate();
  if (projectRef && (!project || !project.agentProfile)) {
    return (
      <AgentPageFrame title="Edit agent">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-6 py-8">
          <p className="text-sm text-muted-foreground">
            {!bootstrapped && !project ? "Loading agent…" : "This agent is no longer available."}
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              closeAgentDialog();
              void navigate({ href: returnHref ?? "/" });
            }}
          >
            Back
          </Button>
        </div>
      </AgentPageFrame>
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
    project?.agentProfile?.avatar ?? { preset: "square", color: "#28B4FF" },
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    project?.agentProfile?.notificationsEnabled ?? true,
  );
  const [newAgentBrowserAccess, setNewAgentBrowserAccess] = useState<boolean | null>(null);
  const [modelOverride, setModel] = useState<ModelSelection | null>(null);
  // Native defaults may arrive after a direct editor route. Explicit picker
  // choices stay local to this edit and survive subsequent catalog refreshes.
  const model =
    modelOverride ??
    resolveDefaultProviderModelSelection(
      providers,
      project?.defaultModelSelection ?? settings.defaultModelSelection,
    );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createAgent = useAtomCommand(projectEnvironment.createAgent, { reportFailure: false });
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const stopSession = useAtomCommand(threadEnvironment.stopSession, { reportFailure: false });
  const updateThread = useAtomCommand(threadEnvironment.updateMetadata, { reportFailure: false });
  const unarchiveThread = useAtomCommand(threadEnvironment.unarchive, { reportFailure: false });
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const threads = useThreadShells();
  const navigate = useNavigate();
  const router = useRouter();
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const returnHref = useAgentDialogStore((state) => state.returnHref);
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
    : (newAgentBrowserAccess ?? settings.enableAgentBrowserAccess);

  // Native mutations finish even after navigation. Only their originating
  // editor may apply the result to local fields, editor intent, or navigation.
  function ownEditorResult() {
    const intent = useAgentDialogStore.getState();
    const href = router.latestLocation.href;
    return () =>
      mounted.current &&
      router.latestLocation.href === href &&
      useAgentDialogStore.getState() === intent;
  }

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
    const ownsResult = ownEditorResult();
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
          input: {
            name: name.trim(),
            agentProfile,
            defaultModelSelection: model,
            enableAgentBrowserAccess: browserEnabled,
          },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        if (!ownsResult()) return;
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
        await openConversation(ownsResult);
      }
    } catch (cause) {
      if (ownsResult())
        setError(cause instanceof Error ? cause.message : "Could not save this agent. Try again.");
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  async function openConversation(ownsResult = ownEditorResult()) {
    if (!ownsResult()) return;
    const conversation = project ? getAgentConversation(project, threads) : null;
    if (conversation) {
      if (conversation.archivedAt !== null) {
        const result = await unarchiveThread({
          environmentId: conversation.environmentId,
          input: { threadId: conversation.id },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      }
      if (!ownsResult()) return;
      closeAgentDialog();
      await navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(conversation.environmentId, conversation.id)),
      });
    } else {
      closeAgentDialog();
      await navigate({ to: "/" });
    }
  }

  function cancel() {
    if (pending) return;
    if (returnHref) {
      closeAgentDialog();
      void navigate({ href: returnHref });
    } else {
      const ownsResult = ownEditorResult();
      void openConversation(ownsResult).catch((cause) => {
        if (ownsResult())
          setError(
            cause instanceof Error ? cause.message : "Could not open this agent. Try again.",
          );
      });
    }
  }

  async function setBrowserAccess(enabled: boolean) {
    if (pending || busy) return;
    if (!project) {
      setNewAgentBrowserAccess(enabled);
      return;
    }
    if (!environmentId) return;
    const ownsResult = ownEditorResult();
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
    if (mounted.current) setPending(false);
    if (!ownsResult()) return;
    if (result._tag === "Failure") {
      const cause = squashAtomCommandFailure(result);
      setError(cause instanceof Error ? cause.message : "Could not save browser access.");
    }
  }

  return (
    <AgentPageFrame title={project ? "Edit agent" : "Create agent"}>
      <form
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">{project ? "Edit agent" : "Create new agent"}</h2>
          <p className="text-sm text-muted-foreground">
            Give your agent a role. It keeps its own conversation and memory.
          </p>
        </div>
        <div className="min-w-0 space-y-4">
          <fieldset disabled={pending || busy} className="space-y-4">
            <AgentAvatarPicker avatar={avatar} onChange={setAvatar} />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
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
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">Role</span>
                <Input
                  value={title}
                  maxLength={200}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Research assistant"
                />
              </label>
            </div>
            <label className="grid gap-1.5">
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
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>Notifications</span>
              <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
            </label>
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>Browser access</span>
              <Switch
                checked={browserEnabled}
                onCheckedChange={(enabled) => {
                  void setBrowserAccess(enabled);
                }}
              />
            </label>
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
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border pt-6">
          <Button type="button" variant="ghost" disabled={pending} onClick={cancel}>
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
        </div>
      </form>
    </AgentPageFrame>
  );
}

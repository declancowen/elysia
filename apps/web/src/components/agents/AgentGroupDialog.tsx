import { ChannelFolderPicker } from "./ChannelFolderPicker";
import { scopeThreadRef } from "@elysiatools/client-runtime/environment";
import { squashAtomCommandFailure } from "@elysiatools/client-runtime/state/runtime";
import type { ProjectId } from "@elysiatools/contracts";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { usePrimaryEnvironmentId } from "../../state/environments";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { buildThreadRouteParams } from "../../threadRoutes";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { useRegularProjects } from "../../hooks/useRegularProjects";
import { Textarea } from "../ui/textarea";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { AgentAvatar } from "./AgentAvatar";
import { useConversationTabsStore } from "../../conversationTabsStore";
import { clearAgentCreationDraft, closeAgentDialog, useAgentDialogStore } from "./agentDialogStore";
import {
  agentGroupCandidates,
  makeAgentGroupProfile,
  resolveAgentGroupSelection,
} from "./AgentGroupDialog.logic";
import type { AgentRosterEntry } from "./useAgents";

export function AgentGroupDialog({
  agents,
  existing,
  page = false,
  onClose,
}: {
  agents: readonly AgentRosterEntry[];
  existing?: AgentRosterEntry;
  page?: boolean;
  onClose: () => void;
}) {
  const draft = useAgentDialogStore((state) =>
    page && !existing ? state.channelCreationDraft : null,
  );
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environmentId = existing?.project.environmentId ?? primaryEnvironmentId;
  const candidates = useMemo(
    () => agentGroupCandidates(agents, environmentId),
    [agents, environmentId],
  );
  const projects = useRegularProjects(false).filter(
    (project) => project.environmentId === environmentId,
  );
  const [description, setDescription] = useState(
    existing?.project.agentProfile?.instructions ?? draft?.description ?? "",
  );
  const [linkedProjectId, setLinkedProjectId] = useState<string>(
    existing?.project.agentProfile?.group?.linkedProjectId ?? draft?.linkedProjectId ?? "",
  );
  const [workspaceRoot, setWorkspaceRoot] = useState(
    existing?.project.agentProfile?.group?.workspaceRoot ?? draft?.workspaceRoot ?? "",
  );
  const [name, setName] = useState(existing?.project.title ?? draft?.name ?? "");
  const [selectedIds, setSelectedIds] = useState<readonly ProjectId[]>(
    existing?.project.agentProfile?.group?.memberProjectIds ??
      draft?.selectedIds ??
      candidates.slice(0, 2).map(({ project }) => project.id),
  );
  const [leadId, setLeadId] = useState<ProjectId | null>(
    existing?.project.agentProfile?.group?.leadProjectId ?? draft?.leadId ?? selectedIds[0] ?? null,
  );
  const [browsingFolder, setBrowsingFolder] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const createAgent = useAtomCommand(projectEnvironment.createAgent, { reportFailure: false });
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const navigate = useNavigate();
  const router = useRouter();
  const selection = resolveAgentGroupSelection(name, candidates, selectedIds, leadId);
  const selectedAgents = candidates.filter(({ project }) => selectedIds.includes(project.id));
  const selectedLead = selectedAgents.find(({ project }) => project.id === leadId)?.project;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (page && !existing)
      useAgentDialogStore.setState({
        channelCreationDraft: {
          name,
          description,
          linkedProjectId,
          workspaceRoot,
          selectedIds,
          leadId,
        },
      });
  }, [page, existing, name, description, linkedProjectId, workspaceRoot, selectedIds, leadId]);

  async function save() {
    if (
      !selection ||
      !environmentId ||
      pendingRef.current ||
      existing?.busy ||
      (!existing && !selection.lead.project.defaultModelSelection)
    )
      return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    const href = router.latestLocation.href;
    const ownsResult = () => mounted.current && router.latestLocation.href === href;
    try {
      const baseProfile = makeAgentGroupProfile(
        selection.lead,
        selectedIds,
        existing?.project.agentProfile ?? undefined,
      );
      const linked = projects.find((project) => project.id === linkedProjectId);
      const agentProfile = {
        ...baseProfile,
        instructions: description.trim(),
        group: {
          ...baseProfile.group!,
          ...(linked
            ? { linkedProjectId: linked.id, workspaceRoot: linked.workspaceRoot }
            : workspaceRoot.trim()
              ? { workspaceRoot: workspaceRoot.trim() }
              : {}),
        },
      };
      if (existing) {
        const result = await updateProject({
          environmentId,
          input: { projectId: existing.project.id, title: name.trim(), agentProfile },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        if (ownsResult()) onClose();
      } else {
        const model = selection.lead.project.defaultModelSelection;
        if (!model) return;
        const result = await createAgent({
          environmentId,
          input: { name: name.trim(), agentProfile, defaultModelSelection: model },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        if (ownsResult()) {
          if (page) {
            useConversationTabsStore
              .getState()
              .retarget(
                { kind: "agent-create", channel: true },
                { kind: "server", threadRef: scopeThreadRef(environmentId, result.value.threadId) },
              );
            clearAgentCreationDraft(true);
            closeAgentDialog();
          } else onClose();
          void navigate({
            to: "/$environmentId/$threadId",
            params: buildThreadRouteParams(scopeThreadRef(environmentId, result.value.threadId)),
          });
        }
      }
    } catch (cause) {
      if (ownsResult())
        setError(cause instanceof Error ? cause.message : "Could not save channel. Try again.");
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(false);
    }
  }

  const Header = page ? "div" : DialogHeader;
  const Title = page ? "h2" : DialogTitle;
  const Description = page ? "p" : DialogDescription;
  const Panel = page ? "div" : DialogPanel;
  const Footer = page ? "div" : DialogFooter;
  const form = (
    <form
      className={
        page
          ? "mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8"
          : "flex min-h-0 flex-1 flex-col"
      }
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Header className={page ? "space-y-2" : undefined}>
        <Title className={page ? "text-xl font-semibold" : undefined}>
          {existing ? "Edit channel" : "New channel"}
        </Title>
        <Description className={page ? "text-sm text-muted-foreground" : undefined}>
          Choose at least two agents and a lead. Each member uses its own selected model.
        </Description>
      </Header>
      <Panel className={page ? "space-y-4" : undefined}>
        <label className="flex flex-col gap-2 text-sm">
          <span>Name</span>
          <Input
            aria-label="Channel name"
            autoFocus
            maxLength={80}
            value={name}
            onValueChange={setName}
            disabled={pending}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span>Channel description</span>
          <Textarea
            aria-label="Channel description"
            maxLength={32000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={pending}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span>Linked project (optional)</span>
          <Select
            value={linkedProjectId}
            onValueChange={(value) => {
              setLinkedProjectId(value ?? "");
              setWorkspaceRoot("");
            }}
            disabled={pending}
          >
            <SelectTrigger aria-label="Linked project">
              <SelectValue>
                {projects.find((project) => project.id === linkedProjectId)?.title ??
                  "No linked project"}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="">No linked project</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.title}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </label>
        {!linkedProjectId ? (
          <label className="flex flex-col gap-2 text-sm">
            <span>Linked folder (optional)</span>
            <div className="flex gap-2">
              <Input
                aria-label="Linked folder"
                placeholder="Absolute folder path on this computer"
                value={workspaceRoot}
                onValueChange={setWorkspaceRoot}
                disabled={pending}
              />
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setBrowsingFolder(true)}
              >
                Browse
              </Button>
            </div>
          </label>
        ) : null}
        <fieldset disabled={pending} className="space-y-2">
          <legend className="mb-2 text-sm">Agents</legend>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border p-2">
            {candidates.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                Create individual agents first.
              </p>
            ) : (
              candidates.map(({ project, busy }) => (
                <label
                  key={project.id}
                  className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-secondary/50"
                >
                  <Checkbox
                    checked={selectedIds.includes(project.id)}
                    disabled={
                      pending || (!selectedIds.includes(project.id) && selectedIds.length >= 32)
                    }
                    onCheckedChange={(checked) => {
                      const next = checked
                        ? [...selectedIds, project.id]
                        : selectedIds.filter((id) => id !== project.id);
                      setSelectedIds(next);
                      if (!leadId || !next.includes(leadId)) setLeadId(next[0] ?? null);
                    }}
                  />
                  <AgentAvatar
                    avatar={project.agentProfile!.avatar}
                    working={busy}
                    className="size-7"
                  />
                  <span className="min-w-0 truncate text-sm">{project.title}</span>
                </label>
              ))
            )}
          </div>
          {selectedIds.length < 2 ? (
            <p className="text-xs text-muted-foreground">Select at least two agents.</p>
          ) : selectedAgents.length !== selectedIds.length ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Some members are unavailable. Select active individual agents.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  const ids = selectedAgents.map(({ project }) => project.id);
                  setSelectedIds(ids);
                  if (!leadId || !ids.includes(leadId)) setLeadId(ids[0] ?? null);
                }}
              >
                Remove unavailable members
              </Button>
            </div>
          ) : null}
        </fieldset>
        <label className="flex flex-col gap-2 text-sm">
          <span>Lead agent</span>
          <Select
            value={leadId}
            onValueChange={(value) => {
              const lead = selectedAgents.find(({ project }) => project.id === value);
              if (lead) setLeadId(lead.project.id);
            }}
            disabled={pending}
          >
            <SelectTrigger className="w-full" aria-label="Lead agent">
              <SelectValue>
                <span className="flex min-w-0 items-center gap-2">
                  {selectedLead?.agentProfile ? (
                    <AgentAvatar
                      avatar={selectedLead.agentProfile.avatar}
                      className="size-5 shrink-0"
                    />
                  ) : null}
                  <span className="truncate">{selectedLead?.title ?? "Choose lead agent"}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {selectedAgents.map(({ project }) => (
                <SelectItem key={project.id} value={project.id}>
                  <span className="flex min-w-0 items-center gap-2">
                    <AgentAvatar
                      avatar={project.agentProfile!.avatar}
                      className="size-5 shrink-0"
                    />
                    <span className="truncate">{project.title}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </label>
        {existing?.busy ? (
          <p role="status" className="text-sm text-muted-foreground">
            Wait for this channel's current task to finish before editing.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </Panel>
      <Footer className={page ? "flex justify-end gap-2 border-t border-border pt-5" : undefined}>
        <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            !selection ||
            pending ||
            existing?.busy ||
            (!existing && !selection?.lead.project.defaultModelSelection)
          }
        >
          {pending ? "Saving…" : existing ? "Save channel" : "Create channel"}
        </Button>
      </Footer>
    </form>
  );
  return (
    <>
      {page ? (
        form
      ) : (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !pendingRef.current) onClose();
          }}
        >
          <DialogPopup className="flex flex-col overflow-hidden" bottomStickOnMobile={false}>
            {form}
          </DialogPopup>
        </Dialog>
      )}
      {browsingFolder && environmentId ? (
        <ChannelFolderPicker
          environmentId={environmentId}
          initialPath={workspaceRoot}
          onChoose={setWorkspaceRoot}
          onClose={() => setBrowsingFolder(false)}
        />
      ) : null}
    </>
  );
}

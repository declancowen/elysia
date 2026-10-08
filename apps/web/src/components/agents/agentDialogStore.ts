import type {
  AgentProfile,
  ModelSelection,
  ProjectId,
  ScopedProjectRef,
} from "@elysiatools/contracts";
import { create } from "zustand";

type AgentEditorTarget = {
  readonly projectRef: ScopedProjectRef | null;
  readonly channel?: boolean;
};
type AgentCreationDraft = {
  name: string;
  title: string;
  instructions: string;
  avatar: AgentProfile["avatar"];
  notificationsEnabled: boolean;
  browserAccess: boolean | null;
  model: ModelSelection | null;
};
type ChannelCreationDraft = {
  name: string;
  description: string;
  linkedProjectId: string;
  workspaceRoot: string;
  selectedIds: readonly ProjectId[];
  leadId: ProjectId | null;
};

export const useAgentDialogStore = create<{
  sectionDialogOpen: boolean;
  target: AgentEditorTarget | null;
  returnHref: string | null;
  creationDraft: AgentCreationDraft | null;
  channelCreationDraft: ChannelCreationDraft | null;
}>(() => ({
  sectionDialogOpen: false,
  target: null,
  returnHref: null,
  creationDraft: null,
  channelCreationDraft: null,
}));

export function clearAgentCreationDraft(channel = false): void {
  useAgentDialogStore.setState(channel ? { channelCreationDraft: null } : { creationDraft: null });
}

export function openChannelDialog(): void {
  useAgentDialogStore.setState({ target: { projectRef: null, channel: true } });
}

export function openAgentDialog(projectRef: ScopedProjectRef | null = null): void {
  useAgentDialogStore.setState({
    target: { projectRef: projectRef ? { ...projectRef } : null },
  });
}

export function closeAgentDialog(): void {
  useAgentDialogStore.setState({ target: null, returnHref: null });
}

/** The editor is a route; existing menu and palette callers send a one-shot navigation intent. */
export function consumeAgentEditorIntent(
  target: AgentEditorTarget,
  originHref: string,
  isEditorPage: boolean,
): boolean {
  const current = useAgentDialogStore.getState();
  if (current.target !== target) return false;
  useAgentDialogStore.setState({
    target: null,
    returnHref: isEditorPage ? current.returnHref : originHref,
  });
  return true;
}

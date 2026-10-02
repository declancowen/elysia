import type { AgentProfile, ModelSelection, ThreadId } from "@t3tools/contracts";
import { agentThreadIsBusy, getAgentConversation } from "../../agentPresentation";
import type { Project, SidebarThreadSummary } from "../../types";

type AgentProject = Pick<
  Project,
  "id" | "environmentId" | "title" | "agentProfile" | "defaultModelSelection"
>;
type AgentThread = Pick<
  SidebarThreadSummary,
  | "id"
  | "environmentId"
  | "projectId"
  | "createdAt"
  | "archivedAt"
  | "modelSelection"
  | "runtime"
  | "activeProviderThreadId"
  | "latestRun"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "pendingBackgroundTasks"
>;

function sameModelSelection(a: ModelSelection | null | undefined, b: ModelSelection) {
  return (
    a?.instanceId === b.instanceId &&
    a.model === b.model &&
    JSON.stringify(a.options ?? []) === JSON.stringify(b.options ?? [])
  );
}

/** Native instructions are fixed when the session starts; the next message must start afresh. */
export async function saveAgentProfile(input: {
  project: AgentProject;
  threads: ReadonlyArray<AgentThread>;
  name: string;
  profile: AgentProfile;
  model: ModelSelection;
  updateProject: () => Promise<void>;
  updateThreadModel: (threadId: ThreadId, model: ModelSelection) => Promise<void>;
  stopSession: (threadId: ThreadId) => Promise<void>;
}) {
  const ownedThreads = input.threads.filter(
    (thread) =>
      thread.environmentId === input.project.environmentId && thread.projectId === input.project.id,
  );
  if (ownedThreads.some((thread) => agentThreadIsBusy(thread))) {
    throw new Error("Wait for the current task to finish before changing instructions.");
  }
  const conversation = getAgentConversation(input.project, ownedThreads);
  const conversationModelChanged =
    conversation !== null && !sameModelSelection(conversation.modelSelection, input.model);
  const runtimeChanged =
    input.project.title !== input.name ||
    input.project.agentProfile?.title !== input.profile.title ||
    input.project.agentProfile?.instructions !== input.profile.instructions ||
    !sameModelSelection(input.project.defaultModelSelection, input.model) ||
    conversationModelChanged;
  // A failed stop must leave the old profile authoritative so retry still detects the change.
  if (runtimeChanged) {
    for (const thread of ownedThreads) {
      if (thread.activeProviderThreadId !== null) await input.stopSession(thread.id);
    }
  }
  await input.updateProject();
  if (conversationModelChanged && conversation)
    await input.updateThreadModel(conversation.id, input.model);
}

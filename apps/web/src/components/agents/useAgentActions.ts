import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { projectEnvironment } from "../../state/projects";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { buildThreadRouteParams } from "../../threadRoutes";
import { toastManager } from "../ui/toast";
import type { AgentRosterEntry } from "./useAgents";

export function useAgentActions({ project, thread, busy }: AgentRosterEntry) {
  const navigate = useNavigate();
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const unarchiveThread = useAtomCommand(threadEnvironment.unarchive, { reportFailure: false });
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);

  async function perform(title: string, action: () => Promise<void>) {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    setPending(true);
    try {
      await action();
      return true;
    } catch (cause) {
      toastManager.add({
        type: "error",
        title,
        description: cause instanceof Error ? cause.message : "Try again.",
      });
      return false;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function openConversation() {
    if (!thread || project.agentProfile!.archived) return Promise.resolve(false);
    return perform("Could not open agent", async () => {
      if (thread.archivedAt !== null) {
        const result = await unarchiveThread({
          environmentId: project.environmentId,
          input: { threadId: thread.id },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      }
      await navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(project.environmentId, thread.id)),
      });
    });
  }

  function archive() {
    if (busy) return Promise.resolve(false);
    return perform("Could not archive agent", async () => {
      const result = await updateProject({
        environmentId: project.environmentId,
        input: {
          projectId: project.id,
          agentProfile: { ...project.agentProfile!, archived: true },
        },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    });
  }

  return { pending, openConversation, archive };
}

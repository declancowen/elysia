import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CommandId, ThreadId, type ProjectId, type ScopedThreadRef } from "@t3tools/contracts";
import { useAtomCommand } from "~/state/use-atom-command";
import { readLocalApi } from "~/localApi";
import { randomUUID } from "~/lib/utils";
import { projectEnvironment } from "~/state/projects";
import { useComposerDraftStore } from "~/composerDraftStore";
import { useConversationTabsStore } from "~/conversationTabsStore";
import { buildThreadRouteParams } from "~/threadRoutes";
import { Trash2Icon } from "~/icons";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import { Button } from "../ui/button";

export interface AgentChatResetTarget {
  projectId: ProjectId;
  threadRef: ScopedThreadRef;
  name: string;
  channel: boolean;
}

export function ClearAgentChatButton({
  target,
  iconOnly = false,
  onCleared,
}: {
  target: AgentChatResetTarget;
  iconOnly?: boolean;
  onCleared?: () => void;
}) {
  const reset = useAtomCommand(projectEnvironment.resetAgent, { reportFailure: false });
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [request] = useState(() => ({
    commandId: CommandId.make(randomUUID()),
    threadId: ThreadId.make(`agent-${randomUUID()}`),
  }));
  const clear = async () => {
    const api = readLocalApi();
    if (!api || pending) return;
    setPending(true);
    try {
      const confirmed = await api.dialogs.confirm(
        `Reset ${target.channel ? "channel" : "agent"} ${target.name}?\n\nThis removes the ${target.channel ? "channel" : "agent"}'s conversation and saved memory and starts it over. This cannot be undone.${target.channel ? " Member agents keep their separate chats and memories." : ""}`,
        { variant: "destructive" },
      );
      if (!confirmed) return;
      const result = await reset({
        environmentId: target.threadRef.environmentId,
        input: {
          ...request,
          projectId: target.projectId,
          previousThreadId: target.threadRef.threadId,
        },
      });
      if (result._tag === "Failure")
        throw new Error("Could not reset the conversation. Try again.");
      const nextRef = {
        environmentId: target.threadRef.environmentId,
        threadId: result.value.threadId,
      };
      useComposerDraftStore.getState().clearDraftThread(target.threadRef);
      useConversationTabsStore
        .getState()
        .retarget(
          { kind: "server", threadRef: target.threadRef },
          { kind: "server", threadRef: nextRef },
        );
      if (onCleared) onCleared();
      else
        await navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams(nextRef),
        });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: `Could not reset ${target.channel ? "channel" : "agent"}`,
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setPending(false);
    }
  };
  const label = target.channel ? "Reset channel" : "Reset agent";
  const button = (
    <Button
      variant="ghost"
      size={iconOnly ? "icon-xs" : "sm"}
      aria-label={label}
      disabled={pending}
      onClick={() => void clear()}
    >
      <Trash2Icon className="size-4" />
      {iconOnly ? null : pending ? "Resetting…" : label}
    </Button>
  );
  return iconOnly ? (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  ) : (
    button
  );
}

import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, MessageCircleIcon } from "~/icons";
import { Button } from "../ui/button";
import ChatMarkdown from "../ChatMarkdown";
import { ComposerBanner } from "./ComposerBanner";
import { AgentAvatar } from "../agents/AgentAvatar";
import { useProject, useThreadShell } from "~/state/entities";
import { scopeProjectRef, scopeThreadRef } from "@elysiatools/client-runtime/environment";
import type { ProjectId, ScopedThreadRef } from "@elysiatools/contracts";
import { stripInlineContextReferences } from "~/lib/composerContextReferences";
import type { ChatMessage } from "~/types";

export function ChannelReplyPreview({
  message,
  threadRef,
  memberProjectId,
  onCancel,
}: {
  message: ChatMessage;
  threadRef: ScopedThreadRef;
  memberProjectId?: ProjectId | undefined;
  onCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sender = useThreadShell(
    message.senderThreadId ? scopeThreadRef(threadRef.environmentId, message.senderThreadId) : null,
  );
  const authorId = memberProjectId ?? sender?.projectId;
  const author = useProject(authorId ? scopeProjectRef(threadRef.environmentId, authorId) : null);
  const text = stripInlineContextReferences(message.text);
  return (
    // Expanding grows upward over the timeline; its reserved height stays fixed.
    <div className="relative mb-2 h-18">
      <ComposerBanner.Root
        placement="floating"
        density="comfortable"
        className="absolute inset-x-0 bottom-0 z-20 max-h-[50dvh]"
        role="region"
        aria-label="Reply preview"
      >
        <ComposerBanner.Row>
          <ComposerBanner.Icon>
            <MessageCircleIcon />
          </ComposerBanner.Icon>
          <ComposerBanner.Content>
            <span>Replying to</span>
            {message.role === "assistant" && author?.agentProfile ? (
              <>
                <AgentAvatar avatar={author.agentProfile.avatar} className="size-4 shrink-0" />
                <span className="truncate">{author.title}</span>
              </>
            ) : (
              <span>{message.role === "user" ? "your message" : "agent response"}</span>
            )}
          </ComposerBanner.Content>
          <ComposerBanner.Actions>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={expanded ? "Collapse reply preview" : "Expand reply preview"}
              aria-expanded={expanded}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? (
                <ChevronDownIcon className="size-3.5" />
              ) : (
                <ChevronUpIcon className="size-3.5" />
              )}
            </Button>
            <ComposerBanner.Dismiss
              onPointerDown={(event) => event.preventDefault()}
              onClick={onCancel}
              aria-label="Cancel reply"
            />
          </ComposerBanner.Actions>
        </ComposerBanner.Row>
        {expanded ? (
          <ComposerBanner.Scroll className="max-h-[calc(50dvh-3rem)]">
            <ComposerBanner.Body className="py-1">
              <ChatMarkdown text={text} cwd={undefined} threadRef={threadRef} />
            </ComposerBanner.Body>
          </ComposerBanner.Scroll>
        ) : (
          <ComposerBanner.Body className="py-1">
            <ChatMarkdown
              text={text}
              cwd={undefined}
              threadRef={threadRef}
              className="line-clamp-1 [&_p]:m-0"
            />
          </ComposerBanner.Body>
        )}
      </ComposerBanner.Root>
    </div>
  );
}

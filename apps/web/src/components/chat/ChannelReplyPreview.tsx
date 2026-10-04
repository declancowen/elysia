import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "~/icons";
import { Button } from "../ui/button";
import { stripInlineContextReferences } from "~/lib/composerContextReferences";
import type { ChatMessage } from "~/types";

export function ChannelReplyPreview({
  message,
  onCancel,
}: {
  message: ChatMessage;
  onCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mb-2 flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="min-w-0 flex-1 cursor-pointer text-left"
      >
        <span className="flex items-center gap-1 text-xs font-medium text-foreground">
          Replying to {message.role === "user" ? "your message" : "agent response"}
          {expanded ? <ChevronUpIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
        </span>
        <span
          className={
            expanded
              ? "mt-1 block max-h-40 overflow-auto whitespace-pre-wrap text-sm text-muted-foreground"
              : "mt-1 block truncate text-sm text-muted-foreground"
          }
        >
          {stripInlineContextReferences(message.text)}
        </span>
      </button>
      <Button
        type="button"
        variant="ghost-muted"
        size="icon-xs"
        onClick={onCancel}
        aria-label="Cancel reply"
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}

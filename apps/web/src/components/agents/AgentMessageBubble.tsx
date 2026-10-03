import type { ReactNode } from "react";
import { cn } from "~/lib/utils";
import { AgentAvatar, type AgentAvatarValue } from "./AgentAvatar";

/** Reserve the avatar column inside the message margins, including narrow threads. */
export function AgentMessageBubble({
  avatar,
  working = false,
  children,
  bubble = true,
}: {
  avatar: AgentAvatarValue | undefined;
  working?: boolean;
  children: ReactNode;
  bubble?: boolean;
}) {
  return (
    <div className={cn("relative min-w-0 text-sm leading-relaxed", avatar && "pl-4 sm:pl-7")}>
      {avatar ? (
        <AgentAvatar
          avatar={avatar}
          working={working}
          className={cn(
            "absolute left-0 size-3 sm:size-5",
            bubble ? "bottom-[calc(0.75rem+0.5lh)] translate-y-1/2" : "top-0.5",
          )}
        />
      ) : null}
      {bubble ? (
        <div className="rounded-2xl bg-message p-3 text-message-foreground">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}

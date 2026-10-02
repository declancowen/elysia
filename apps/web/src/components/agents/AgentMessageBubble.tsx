import type { ReactNode } from "react";
import { AgentAvatar, type AgentAvatarValue } from "./AgentAvatar";

/** Avatars live in the gutter; the bubble keeps the normal message-column alignment. */
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
    <div className="relative min-w-0">
      {avatar ? (
        <AgentAvatar
          avatar={avatar}
          working={working}
          className="absolute right-full top-3 mr-1 size-3 sm:mr-2 sm:size-5"
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

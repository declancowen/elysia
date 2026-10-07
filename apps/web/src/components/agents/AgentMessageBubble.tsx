import type { ReactNode } from "react";
import { cn } from "~/lib/utils";
import { ChannelIcon } from "~/icons";
import { AgentAvatar, type AgentAvatarValue } from "./AgentAvatar";

/** Reserve the avatar column inside the message margins, including narrow threads. */
export function AgentMessageBubble({
  avatar,
  working = false,
  group = false,
  children,
  bubble = true,
}: {
  avatar: AgentAvatarValue | undefined;
  working?: boolean;
  group?: boolean;
  children: ReactNode;
  bubble?: boolean;
}) {
  const identityClassName = cn(
    "absolute left-0 size-3 sm:size-5",
    bubble ? "bottom-[calc(0.75rem+0.5lh)] translate-y-1/2" : "top-0.5",
  );
  return (
    <div
      className={cn(
        "relative min-w-0 text-sm leading-relaxed [--chat-foreground:light-dark(#000,#fff)] text-chat-foreground",
        (group || avatar) && "pl-4 sm:pl-7",
      )}
    >
      {group ? (
        <ChannelIcon aria-hidden className={identityClassName} />
      ) : avatar ? (
        <AgentAvatar avatar={avatar} working={working} className={identityClassName} />
      ) : null}
      {bubble ? <div className="rounded-2xl bg-message p-3">{children}</div> : children}
    </div>
  );
}

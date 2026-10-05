import type { AgentProfile } from "@t3tools/contracts";
import { ChannelIcon } from "~/icons";
import { cn } from "~/lib/utils";
import { AgentAvatar } from "./AgentAvatar";

/** Group conversations keep member identity; message tags use the group icon. */
export function AgentGroupAvatar({
  avatars,
  className,
}: {
  avatars: readonly AgentProfile["avatar"][];
  className?: string;
}) {
  const count = avatars.length;
  const positions =
    count === 2
      ? [
          { left: "0%", top: "25%" },
          { left: "52%", top: "25%" },
        ]
      : count === 3
        ? [
            { left: "0%", top: "0%" },
            { left: "52%", top: "0%" },
            { left: "26%", top: "52%" },
          ]
        : [
            { left: "0%", top: "0%" },
            { left: "52%", top: "0%" },
            { left: "0%", top: "52%" },
            { left: "52%", top: "52%" },
          ];
  if (!count) return <ChannelIcon aria-hidden className={cn("size-11 shrink-0", className)} />;
  if (count === 1) return <AgentAvatar avatar={avatars[0]!} className={cn("size-11", className)} />;
  return (
    <span aria-hidden className={cn("relative inline-block size-11 shrink-0", className)}>
      {positions.map((position, index) => (
        <span
          key={`${position.left}:${position.top}`}
          className="absolute flex h-[48%] w-[48%] items-center justify-center"
          style={position}
        >
          {count > 4 && index === 3 ? (
            <span className="flex size-full items-center justify-center text-sm font-semibold tabular-nums text-foreground">
              +{count - 3}
            </span>
          ) : (
            <AgentAvatar avatar={avatars[index]!} className="size-full" />
          )}
        </span>
      ))}
    </span>
  );
}

import type { AgentProfile } from "@t3tools/contracts";
import { UsersIcon } from "~/icons";
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
  // Match OpenBot’s 44% centre pitch; our 60% boxes draw roughly 55% wide,
  // retaining the slight overlap with Elysia’s tighter SVG silhouettes.
  const positions =
    count === 2
      ? [
          { left: "-2%", top: "20%" },
          { left: "42%", top: "20%" },
        ]
      : count === 3
        ? [
            { left: "-2%", top: "-2%" },
            { left: "42%", top: "-2%" },
            { left: "20%", top: "42%" },
          ]
        : [
            { left: "-2%", top: "-2%" },
            { left: "42%", top: "-2%" },
            { left: "-2%", top: "42%" },
            { left: "42%", top: "42%" },
          ];
  if (!count) return <UsersIcon aria-hidden className={cn("size-11 shrink-0", className)} />;
  if (count === 1) return <AgentAvatar avatar={avatars[0]!} className={cn("size-11", className)} />;
  return (
    <span aria-hidden className={cn("relative inline-block size-11 shrink-0", className)}>
      {positions.map((position, index) => (
        <span key={index} className="absolute h-[60%] w-[60%]" style={position}>
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

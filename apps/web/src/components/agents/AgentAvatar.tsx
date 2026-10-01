import {
  AGENT_AVATAR_COLORS,
  AGENT_AVATAR_SHAPES,
  agentAvatarEyeColor,
  resolveAgentAvatar,
} from "@t3tools/shared/agentAvatar";
import type { Project } from "../../types";
import { cn } from "../../lib/utils";

export type AgentAvatarValue = NonNullable<Project["agentProfile"]>["avatar"];
export { AGENT_AVATAR_COLORS, agentAvatarEyeColor as agentAvatarGlyphColor };
export const AGENT_AVATAR_PRESETS = AGENT_AVATAR_SHAPES;

export function AgentAvatar({
  avatar,
  className,
}: {
  avatar: AgentAvatarValue;
  className?: string;
}) {
  const character = resolveAgentAvatar(avatar);
  return (
    <span className={cn("inline-flex size-4 shrink-0", className)} aria-hidden="true">
      <svg viewBox="0 0 100 100" className="size-full">
        <path d={character.path} fill={character.color} />
        <g fill={character.eyeColor}>
          {character.eyes.map((eye) => (
            <rect
              key={eye.side}
              x={-character.eyeWidth / 2}
              y={-character.eyeHeight / 2}
              width={character.eyeWidth}
              height={character.eyeHeight}
              rx={character.eyeRadius}
              transform={`translate(${eye.x} ${eye.y}) rotate(${eye.rotate}) scale(${eye.scale})`}
            />
          ))}
        </g>
      </svg>
    </span>
  );
}

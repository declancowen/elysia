import {
  AGENT_AVATAR_COLORS,
  AGENT_AVATAR_SHAPES,
  agentAvatarEyeColor,
  resolveAgentAvatar,
} from "@t3tools/shared/agentAvatar";
import type { CSSProperties } from "react";
import type { Project } from "../../types";
import { cn } from "../../lib/utils";
import { observeVisibleAnimation } from "../../lib/visibleAnimation";

export type AgentAvatarValue = NonNullable<Project["agentProfile"]>["avatar"];
export { AGENT_AVATAR_COLORS, agentAvatarEyeColor as agentAvatarGlyphColor };
export const AGENT_AVATAR_PRESETS = AGENT_AVATAR_SHAPES;

export function AgentAvatar({
  avatar,
  className,
  style,
  animated = true,
  working = false,
}: {
  avatar: AgentAvatarValue;
  className?: string;
  style?: CSSProperties;
  animated?: boolean;
  working?: boolean;
}) {
  const character = resolveAgentAvatar(avatar);
  const appearance = `${character.preset}:${character.color}:${working}`;
  const avatarStyle: CSSProperties & { "--agent-avatar-blink-delay": string } = {
    "--agent-avatar-blink-delay": `${-0.43 * AGENT_AVATAR_SHAPES.findIndex((entry) => entry.value === character.preset)}s`,
    ...style,
  };
  return (
    <span
      ref={animated ? observeVisibleAnimation : undefined}
      className={cn("agent-avatar inline-flex size-4 shrink-0", className)}
      style={avatarStyle}
      data-animated={animated}
      data-working={working}
      aria-hidden="true"
    >
      <span key={appearance} className="agent-avatar-figure block size-full">
        <svg viewBox="0 0 100 100" className="size-full overflow-visible">
          <path d={character.path} fill={character.color} />
          <g fill={character.eyeColor}>
            {character.eyes.map((eye) => (
              <g
                key={eye.side}
                transform={`translate(${eye.x} ${eye.y}) rotate(${eye.rotate}) scale(${eye.scale})`}
              >
                <rect
                  className="agent-avatar-eye"
                  x={-character.eyeWidth / 2}
                  y={-character.eyeHeight / 2}
                  width={character.eyeWidth}
                  height={character.eyeHeight}
                  rx={character.eyeRadius}
                />
              </g>
            ))}
          </g>
        </svg>
      </span>
    </span>
  );
}

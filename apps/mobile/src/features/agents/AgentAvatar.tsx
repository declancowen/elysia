import type { AgentProfile } from "@t3tools/contracts";
import { resolveAgentAvatar } from "@t3tools/shared/agentAvatar";
import Svg, { G, Path, Rect } from "react-native-svg";

export function AgentAvatar({
  avatar,
  size = 20,
}: {
  readonly avatar: AgentProfile["avatar"];
  readonly size?: number;
}) {
  const character = resolveAgentAvatar(avatar);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessible={false}>
      <Path d={character.path} fill={character.color} />
      <G fill={character.eyeColor}>
        {character.eyes.map((eye) => (
          <Rect
            key={eye.side}
            x={-character.eyeWidth / 2}
            y={-character.eyeHeight / 2}
            width={character.eyeWidth}
            height={character.eyeHeight}
            rx={character.eyeRadius}
            transform={`translate(${eye.x} ${eye.y}) rotate(${eye.rotate}) scale(${eye.scale})`}
          />
        ))}
      </G>
    </Svg>
  );
}

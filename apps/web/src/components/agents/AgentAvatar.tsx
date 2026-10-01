import {
  BotIcon,
  BrainIcon,
  BriefcaseIcon,
  CodeXmlIcon,
  OrbitIcon,
  SparklesIcon,
} from "lucide-react";
import type { Project } from "../../types";
import { projectIconColorClassName } from "../../projectIconColors";
import { cn } from "../../lib/utils";

export type AgentAvatarValue = NonNullable<Project["agentProfile"]>["avatar"];

export const AGENT_AVATAR_PRESETS = [
  { value: "robot", label: "Robot", icon: BotIcon },
  { value: "sparkles", label: "Sparkles", icon: SparklesIcon },
  { value: "brain", label: "Brain", icon: BrainIcon },
  { value: "briefcase", label: "Briefcase", icon: BriefcaseIcon },
  { value: "code", label: "Code", icon: CodeXmlIcon },
  { value: "planet", label: "Planet", icon: OrbitIcon },
] as const;

export const AGENT_AVATAR_COLORS = [
  "#003CB2",
  "#28B4FF",
  "#AAE6FF",
  "#C9FCED",
  "#33D7C8",
  "#00786E",
  "#D8AFFF",
  "#9423FC",
  "#551491",
  "#FFB2C1",
  "#FF547C",
  "#BF1B4F",
  "#F5E669",
  "#EEAF00",
  "#B05223",
] as const;

const WHITE_GLYPH_COLORS = new Set([
  "#003CB2",
  "#00786E",
  "#9423FC",
  "#551491",
  "#BF1B4F",
  "#B05223",
]);

function isHexColor(
  color: AgentAvatarValue["color"],
): color is (typeof AGENT_AVATAR_COLORS)[number] {
  return color.startsWith("#");
}

export function agentAvatarGlyphColor(color: (typeof AGENT_AVATAR_COLORS)[number]) {
  return WHITE_GLYPH_COLORS.has(color) ? "#FFFFFF" : "#000000";
}

export function AgentAvatar({
  avatar,
  className,
}: {
  avatar: AgentAvatarValue;
  className?: string;
}) {
  const Icon =
    AGENT_AVATAR_PRESETS.find((preset) => preset.value === avatar.preset)?.icon ?? BotIcon;
  const hexColor = isHexColor(avatar.color) ? avatar.color : null;
  return (
    <span
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent",
        !isHexColor(avatar.color) && projectIconColorClassName(avatar.color),
        className,
      )}
      style={hexColor ? { backgroundColor: hexColor } : undefined}
      aria-hidden="true"
    >
      <Icon
        className="size-4"
        style={hexColor ? { color: agentAvatarGlyphColor(hexColor) } : undefined}
      />
    </span>
  );
}

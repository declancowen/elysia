import { cn } from "../../lib/utils";
import { agentAvatarPreset } from "@t3tools/shared/agentAvatar";
import {
  AGENT_AVATAR_COLORS,
  AGENT_AVATAR_PRESETS,
  AgentAvatar,
  type AgentAvatarValue,
} from "./AgentAvatar";

export function AgentAvatarPicker({
  avatar,
  onChange,
}: {
  avatar: AgentAvatarValue;
  onChange: (avatar: AgentAvatarValue) => void;
}) {
  return (
    <fieldset className="min-w-0 space-y-4">
      <legend className="sr-only">Avatar</legend>
      <div className="flex justify-center">
        <AgentAvatar avatar={avatar} className="size-24" />
      </div>
      <div
        className="flex justify-center-safe gap-2 overflow-x-auto py-1"
        role="group"
        aria-label="Avatar color"
      >
        {AGENT_AVATAR_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Color ${color}`}
            aria-pressed={avatar.color === color}
            className={cn(
              "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              avatar.color === color && "border-foreground/65",
            )}
            onClick={() => onChange({ ...avatar, color })}
          >
            <span className="size-6 rounded-full" style={{ backgroundColor: color }} />
          </button>
        ))}
      </div>
      <div
        className="flex justify-center-safe gap-2 overflow-x-auto py-1"
        role="group"
        aria-label="Avatar shape"
      >
        {AGENT_AVATAR_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            aria-label={preset.label}
            aria-pressed={agentAvatarPreset(avatar.preset) === preset.value}
            className={cn(
              "shrink-0 cursor-pointer rounded-md border border-transparent p-1.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              agentAvatarPreset(avatar.preset) === preset.value && "border-border bg-accent",
            )}
            onClick={() => onChange({ ...avatar, preset: preset.value })}
          >
            <AgentAvatar
              avatar={{ ...avatar, preset: preset.value }}
              className="size-8"
              animated={false}
            />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

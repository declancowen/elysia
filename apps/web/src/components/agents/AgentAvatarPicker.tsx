import { cn } from "../../lib/utils";
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
    <fieldset className="space-y-3">
      <legend className="mb-1.5 text-sm font-medium">Avatar</legend>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Avatar icon">
        {AGENT_AVATAR_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            aria-label={preset.label}
            aria-pressed={avatar.preset === preset.value}
            className={cn(
              "rounded-md border border-transparent p-1.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              avatar.preset === preset.value && "border-border bg-accent",
            )}
            onClick={() => onChange({ ...avatar, preset: preset.value })}
          >
            <AgentAvatar avatar={{ ...avatar, preset: preset.value }} />
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Avatar color">
        {AGENT_AVATAR_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Color ${color}`}
            aria-pressed={avatar.color === color}
            className={cn(
              "flex size-7 items-center justify-center rounded-full border border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              avatar.color === color && "border-foreground/65",
            )}
            onClick={() => onChange({ ...avatar, color })}
          >
            <span className="size-5 rounded-full" style={{ backgroundColor: color }} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId } from "@t3tools/contracts";
import IconRobot from "@tabler/icons-react-native/IconRobot";
import { Pressable, View } from "react-native";

import { AppText } from "../../components/AppText";
import { SymbolView, type AppSymbolName } from "../../components/AppSymbol";
import { cn } from "../../lib/cn";
import { scopedProjectKey, scopedThreadKey } from "../../lib/scopedEntities";
import type { AgentRosterEntry } from "./agentPresentation";

const AVATAR_SYMBOLS = {
  robot: "person.crop.circle",
  sparkles: "sparkles",
  brain: "brain",
  briefcase: "briefcase",
  code: "chevron.left.forwardslash.chevron.right",
  planet: "globe",
} satisfies Record<AgentRosterEntry["project"]["agentProfile"]["avatar"]["preset"], AppSymbolName>;

const AVATAR_COLORS = new Map(
  Object.entries({
    blue: "#60a5fa",
    violet: "#a78bfa",
    green: "#4ade80",
    orange: "#fb923c",
    rose: "#fb7185",
    cyan: "#22d3ee",
  }),
);
const WHITE_AVATAR_GLYPHS = new Set([
  "#003CB2",
  "#00786E",
  "#9423FC",
  "#551491",
  "#BF1B4F",
  "#B05223",
]);

export function AgentRoster(props: {
  readonly agents: ReadonlyArray<AgentRosterEntry>;
  readonly environmentId: EnvironmentId | null;
  readonly searchQuery: string;
  readonly selectedThreadKey?: string | null;
  readonly onSelectThread: (thread: EnvironmentThreadShell) => void;
}) {
  const query = props.searchQuery.trim().toLocaleLowerCase();
  const agents = props.agents.filter(
    ({ project }) =>
      (props.environmentId === null || project.environmentId === props.environmentId) &&
      (query.length === 0 ||
        [project.title, project.agentProfile.title ?? ""].some((value) =>
          value.toLocaleLowerCase().includes(query),
        )),
  );
  if (agents.length === 0) return null;

  return (
    <View className="px-2 pb-3">
      <AppText
        accessibilityRole="header"
        className="px-3 pb-2 pt-3 text-sm font-semibold text-muted-foreground"
      >
        Agents
      </AppText>
      {agents.map(({ project, conversation }) => {
        const avatarColor =
          AVATAR_COLORS.get(project.agentProfile.avatar.color) ?? project.agentProfile.avatar.color;
        const coloredTile = project.agentProfile.avatar.color.startsWith("#");
        const glyphColor = coloredTile
          ? WHITE_AVATAR_GLYPHS.has(avatarColor)
            ? "#FFFFFF"
            : "#000000"
          : avatarColor;
        const selected =
          conversation !== null &&
          scopedThreadKey(conversation.environmentId, conversation.id) === props.selectedThreadKey;
        return (
          <Pressable
            key={scopedProjectKey(project.environmentId, project.id)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${project.title}`}
            accessibilityState={{ selected, disabled: conversation === null }}
            disabled={conversation === null}
            onPress={() => {
              if (conversation) props.onSelectThread(conversation);
            }}
            className={cn(
              "min-h-14 flex-row items-center gap-3 rounded-xl px-3 py-2",
              selected && "bg-thread-selected",
            )}
          >
            <View
              className="h-9 w-9 items-center justify-center rounded-full bg-surface"
              style={coloredTile ? { backgroundColor: avatarColor } : undefined}
            >
              {project.agentProfile.avatar.preset === "robot" ? (
                <IconRobot size={22} color={glyphColor} />
              ) : (
                <SymbolView
                  name={AVATAR_SYMBOLS[project.agentProfile.avatar.preset]}
                  size={22}
                  tintColor={glyphColor}
                />
              )}
            </View>
            <View className="flex-1">
              <AppText
                numberOfLines={1}
                className={cn(
                  "text-base font-medium",
                  selected && "text-thread-selected-foreground",
                )}
              >
                {project.title}
              </AppText>
              {project.agentProfile.title || conversation === null ? (
                <AppText
                  numberOfLines={1}
                  className={cn(
                    "text-xs",
                    selected ? "text-thread-selected-foreground-muted" : "text-muted-foreground",
                  )}
                >
                  {conversation === null ? "Conversation unavailable" : project.agentProfile.title}
                </AppText>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

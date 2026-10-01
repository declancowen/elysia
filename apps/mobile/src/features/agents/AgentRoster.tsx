import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId } from "@t3tools/contracts";
import { Pressable, View } from "react-native";

import { AppText } from "../../components/AppText";
import { cn } from "../../lib/cn";
import { scopedProjectKey, scopedThreadKey } from "../../lib/scopedEntities";
import type { AgentRosterEntry } from "./agentPresentation";
import { AgentAvatar } from "./AgentAvatar";

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
            <AgentAvatar avatar={project.agentProfile.avatar} />
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

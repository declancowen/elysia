import type { Project } from "../../types";
import { AgentAvatar } from "./AgentAvatar";
import { useAgents } from "./useAgents";

export function AgentConversationWelcome({ project }: { project: Project }) {
  const agents = useAgents();
  const profile = project.agentProfile!;
  const members = profile.group
    ? profile.group.memberProjectIds.flatMap((id) => {
        const member = agents.find(
          ({ project: candidate }) =>
            candidate.environmentId === project.environmentId && candidate.id === id,
        );
        return member ? [member.project] : [];
      })
    : [project];
  return (
    <div className="flex flex-col items-center gap-5 p-6 text-center">
      <div
        className="flex flex-wrap justify-center gap-3"
        aria-label={profile.group ? "Channel members" : "Agent"}
      >
        {members.map((member) => (
          <AgentAvatar key={member.id} avatar={member.agentProfile!.avatar} className="size-12" />
        ))}
      </div>
      <p className="text-xl font-medium">{project.title}</p>
    </div>
  );
}

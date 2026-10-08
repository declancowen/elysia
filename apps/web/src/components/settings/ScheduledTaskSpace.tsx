import type { EnvironmentProject } from "@elysiatools/client-runtime/state/shell";
import { ProjectFavicon } from "../ProjectFavicon";
import { AgentAvatar } from "../agents/AgentAvatar";
import { AgentGroupAvatar } from "../agents/AgentGroupAvatar";

export function ScheduledTaskSpace({
  project,
  projects,
}: {
  project: EnvironmentProject;
  projects: readonly EnvironmentProject[];
}) {
  const profile = project.agentProfile;
  const members = profile?.group?.memberProjectIds ?? [];
  return (
    <span className="flex min-w-0 items-center gap-2">
      {profile?.group ? (
        <AgentGroupAvatar
          className="size-4"
          avatars={projects.flatMap((member) =>
            member.environmentId === project.environmentId &&
            members.includes(member.id) &&
            member.agentProfile &&
            !member.agentProfile.archived
              ? [member.agentProfile.avatar]
              : [],
          )}
        />
      ) : profile ? (
        <AgentAvatar avatar={profile.avatar} animated={false} />
      ) : (
        <ProjectFavicon project={project} />
      )}
      <span className="truncate">{project.title}</span>
    </span>
  );
}

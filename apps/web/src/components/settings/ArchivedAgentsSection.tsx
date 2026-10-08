import type { EnvironmentId } from "@elysiatools/contracts";
import { squashAtomCommandFailure } from "@elysiatools/client-runtime/state/runtime";
import { RotateCcwIcon, ChannelIcon } from "~/icons";
import { useMemo, useRef, useState } from "react";
import { useEnvironments } from "../../state/environments";
import { useProjects } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import type { Project } from "../../types";
import { AgentAvatar } from "../agents/AgentAvatar";
import { Button } from "../ui/button";
import { SettingsRow, SettingsSection } from "./settingsLayout";

export function ArchivedAgentsSection({
  environmentIds,
  channels = false,
}: {
  environmentIds: ReadonlyArray<EnvironmentId>;
  channels?: boolean;
}) {
  const projects = useProjects();
  const { environments } = useEnvironments();
  const agents = useMemo(() => {
    const scope = new Set(environmentIds);
    return projects
      .filter(
        (project) =>
          scope.has(project.environmentId) &&
          project.agentProfile?.archived &&
          !!project.agentProfile.group === channels,
      )
      .toSorted((a, b) => a.title.localeCompare(b.title));
  }, [environmentIds, projects, channels]);
  return (
    <SettingsSection title={channels ? "Archived channels" : "Archived agents"}>
      {agents.length === 0 ? (
        <SettingsRow
          title={channels ? "No archived channels" : "No archived agents"}
          description={
            channels
              ? "Archived channels will appear here. Their conversations are preserved."
              : "Archived agents will appear here. Their conversations and memory are preserved."
          }
        />
      ) : (
        agents.map((project) => (
          <ArchivedAgentRow
            key={`${project.environmentId}:${project.id}`}
            project={project}
            connected={environments.some(
              (environment) =>
                environment.environmentId === project.environmentId &&
                environment.connection.phase === "connected",
            )}
          />
        ))
      )}
    </SettingsSection>
  );
}

function ArchivedAgentRow({ project, connected }: { project: Project; connected: boolean }) {
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profile = project.agentProfile!;
  async function restore() {
    if (pendingRef.current || !connected || !profile.archived) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await updateProject({
        environmentId: project.environmentId,
        input: { projectId: project.id, agentProfile: { ...profile, archived: false } },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not restore this agent. Try again.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }
  return (
    <SettingsRow
      title={
        <span className="inline-flex items-center gap-2">
          {profile.group ? (
            <ChannelIcon className="size-4" />
          ) : (
            <AgentAvatar avatar={profile.avatar} />
          )}
          {project.title}
        </span>
      }
      description={profile.title ?? "Conversation and memory preserved."}
      control={
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Restore ${project.title}`}
          disabled={pending || !connected}
          onClick={() => {
            void restore();
          }}
        >
          <RotateCcwIcon className="size-3.5" />
          {pending ? "Restoring…" : "Restore"}
        </Button>
      }
    >
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : !connected ? (
        <p className="text-sm text-muted-foreground">
          Reconnect this environment to restore the agent.
        </p>
      ) : null}
    </SettingsRow>
  );
}

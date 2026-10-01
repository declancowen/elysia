import type { EnvironmentId } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { RotateCcwIcon } from "lucide-react";
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
}: {
  environmentIds: ReadonlyArray<EnvironmentId>;
}) {
  const projects = useProjects();
  const { environments } = useEnvironments();
  const agents = useMemo(() => {
    const scope = new Set(environmentIds);
    return projects
      .filter((project) => scope.has(project.environmentId) && project.agentProfile?.archived)
      .toSorted((a, b) => a.title.localeCompare(b.title));
  }, [environmentIds, projects]);
  return (
    <SettingsSection title="Archived agents">
      {agents.length === 0 ? (
        <SettingsRow
          title="No archived agents"
          description="Archived agents will appear here. Their conversations and memory are preserved."
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
          <AgentAvatar avatar={profile.avatar} />
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

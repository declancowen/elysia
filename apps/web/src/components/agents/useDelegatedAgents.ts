import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef } from "@elysiatools/client-runtime/environment";
import type { ScopedThreadRef } from "@elysiatools/contracts";
import { isAgentDelegationActive, type DelegatedAgent } from "@elysiatools/shared/agentMentions";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { useEffect, useRef } from "react";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { useProjects, useThreadShellsForProjectRefs } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";

// Stable targets keep equivalent route/job objects on one subscription.
const delegationValuesAtom = Atom.family((key: string | null) => {
  const target =
    key === null
      ? null
      : (JSON.parse(key) as readonly [
          ScopedThreadRef["environmentId"],
          ScopedThreadRef["threadId"],
          ReadonlyArray<DelegatedAgent["activityId"]>,
        ]);
  const queries =
    target === null
      ? []
      : target[2].map((activityId) =>
          projectEnvironment.getAgentDelegation({
            environmentId: target[0],
            input: { sourceThreadId: target[1], activityId },
          }),
        );
  return Atom.make((get) => queries.map((query) => get(query)));
});

/** Follow only source-linked jobs. Shell events drive reads; opening this never invokes a model. */
export function useDelegatedAgents(
  source: ScopedThreadRef | null,
  jobs: ReadonlyArray<DelegatedAgent>,
) {
  const projects = useProjects();
  const refs = source
    ? jobs.flatMap((job) => {
        const project = projects.find(
          (candidate) =>
            candidate.environmentId === source.environmentId && candidate.id === job.agentProjectId,
        );
        return [job.agentProjectId, ...(project?.agentProfile?.group?.memberProjectIds ?? [])].map(
          (projectId) => scopeProjectRef(source.environmentId, projectId),
        );
      })
    : [];
  const shells = useThreadShellsForProjectRefs(refs);
  const queries = source
    ? jobs.map((job) =>
        projectEnvironment.getAgentDelegation({
          environmentId: source.environmentId,
          input: { sourceThreadId: source.threadId, activityId: job.activityId },
        }),
      )
    : [];
  const results = useAtomValue(
    delegationValuesAtom(
      source === null
        ? null
        : JSON.stringify([
            source.environmentId,
            source.threadId,
            jobs.map((job) => job.activityId),
          ]),
    ),
  );
  const revisions = useRef(new Map<string, { value: string | undefined; dirty: boolean }>());
  useEffect(() => {
    jobs.forEach((job, index) => {
      const query = queries[index];
      const result = results[index];
      if (!source || !query || !result) return;
      const key = `${source.environmentId}:${source.threadId}:${job.activityId}`;
      const project = projects.find(
        (candidate) =>
          candidate.environmentId === source.environmentId && candidate.id === job.agentProjectId,
      );
      const members = project?.agentProfile?.group?.memberProjectIds ?? [];
      const watched = shells.filter(
        (shell) =>
          shell.environmentId === source.environmentId &&
          (shell.id === job.agentThreadId || members.includes(shell.projectId)),
      );
      const value = watched.length
        ? JSON.stringify(
            watched
              .toSorted((a, b) => a.id.localeCompare(b.id))
              .map((shell) => [
                shell.id,
                shell.updatedAt,
                shell.latestRun?.runId,
                shell.latestRun?.status,
                shell.runtime?.status,
                shell.runtime?.activeRunId,
                shell.hasPendingApprovals,
                shell.hasPendingUserInput,
              ]),
          )
        : undefined;
      const previous = revisions.current.get(key);
      const data = Option.getOrNull(AsyncResult.value(result));
      const revision = {
        value,
        dirty: previous
          ? previous.dirty || previous.value !== value
          : Boolean(data && isAgentDelegationActive(data.status) && !result.waiting),
      };
      revisions.current.set(key, revision);
      if (data && !isAgentDelegationActive(data.status)) {
        revision.dirty = false;
        return;
      }
      // A later event waits for the current read to settle rather than cancelling it mid-stream.
      if (revision.dirty && !result.waiting) {
        revision.dirty = false;
        appAtomRegistry.refresh(query);
      }
    });
  }, [jobs, projects, queries, results, shells, source]);
  return jobs.map((job, index) => {
    const result = results[index];
    const data = result ? Option.getOrNull(AsyncResult.value(result)) : null;
    const project = projects.find(
      (candidate) =>
        candidate.environmentId === source?.environmentId && candidate.id === job.agentProjectId,
    );
    const failed = result?._tag === "Failure";
    return {
      job,
      data,
      project,
      name: project?.title ?? job.agentName,
      working: !failed && (!data || isAgentDelegationActive(data.status)),
    };
  });
}

export type DelegatedAgentView = ReturnType<typeof useDelegatedAgents>[number];

/** Keep task history, but count and display each persistent agent once. */
export function groupDelegatedAgents(agents: ReadonlyArray<DelegatedAgentView>) {
  const groups = new Map<string, DelegatedAgentView[]>();
  for (const agent of agents) {
    const key = agent.job.agentProjectId;
    const jobs = groups.get(key) ?? [];
    jobs.push(agent);
    groups.set(key, jobs);
  }
  return [...groups.values()].map((jobs) => {
    const agent = jobs.findLast((job) => job.working) ?? jobs[jobs.length - 1]!;
    return { ...agent, jobs };
  });
}

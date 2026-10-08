import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef } from "@elysiatools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@elysiatools/contracts";
import { isAgentDelegationActive, type DelegatedAgent } from "@elysiatools/shared/agentMentions";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { useEffect, useMemo, useRef } from "react";
import { appAtomRegistry } from "../../state/atom-registry";
import { useProjects } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { environmentThreadShells } from "../../state/threads";
import { delegationShellRevision } from "./delegatedAgentWork.logic";

/** Canonical task reads follow shell changes; neither channel status nor a handoff card starts a model. */
export function useDelegatedAgents(
  source: ScopedThreadRef | null,
  jobs: ReadonlyArray<DelegatedAgent>,
) {
  const projects = useProjects();
  const refs = useMemo(
    () =>
      source
        ? jobs.flatMap((job) => {
            const project = projects.find(
              (candidate) =>
                candidate.environmentId === source.environmentId &&
                candidate.id === job.agentProjectId,
            );
            return [
              job.agentProjectId,
              ...(project?.agentProfile?.group?.memberProjectIds ?? []),
            ].map((projectId) => scopeProjectRef(source.environmentId, projectId));
          })
        : [],
    [source, jobs, projects],
  );
  const shells = useAtomValue(environmentThreadShells.threadShellsForProjectRefsAtom(refs));
  const queries = useMemo(
    () =>
      source
        ? jobs.map((job) =>
            projectEnvironment.getAgentDelegation({
              environmentId: source.environmentId,
              input: { sourceThreadId: source.threadId, activityId: job.activityId },
            }),
          )
        : [],
    [source, jobs],
  );
  const resultsAtom = useMemo(
    () => Atom.make((get) => queries.map((query) => get(query))),
    [queries],
  );
  const results = useAtomValue(resultsAtom);
  const revisions = useRef(new Map<string, { value: string | null; dirty: boolean }>());
  useEffect(() => {
    jobs.forEach((job, index) => {
      const query = queries[index],
        result = results[index];
      if (!source || !query || !result) return;
      const key = `${source.environmentId}:${source.threadId}:${job.activityId}`;
      const project = projects.find(
        (candidate) =>
          candidate.environmentId === source.environmentId && candidate.id === job.agentProjectId,
      );
      const members = project?.agentProfile?.group?.memberProjectIds ?? [];
      const value = delegationShellRevision(
        shells.find((shell) => shell.id === job.agentThreadId) ?? null,
        shells.filter((shell) => members.includes(shell.projectId)),
      );
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
      if (revision.dirty && !result.waiting) {
        revision.dirty = false;
        appAtomRegistry.refresh(query);
      }
    });
  }, [source, jobs, projects, shells, queries, results]);
  return useMemo(
    () =>
      jobs.map((job, index) => {
        const result = results[index],
          query = queries[index];
        const data = result ? Option.getOrNull(AsyncResult.value(result)) : null;
        const cause = result?._tag === "Failure" ? Cause.squash(result.cause) : null;
        const error =
          cause === null
            ? null
            : cause instanceof Error
              ? cause.message
              : "The task is unavailable.";
        return {
          job,
          data,
          error,
          isPending: result?.waiting ?? false,
          working: error === null && (!data || isAgentDelegationActive(data.status)),
          refresh: () => {
            if (query) appAtomRegistry.refresh(query);
          },
        };
      }),
    [jobs, queries, results],
  );
}

export function useDelegatedWork(
  environmentId: EnvironmentId,
  sourceThreadId: ThreadId,
  delegation: DelegatedAgent,
) {
  const source = useMemo(
    () => ({ environmentId, threadId: sourceThreadId }),
    [environmentId, sourceThreadId],
  );
  const jobs = useMemo(() => [delegation], [delegation]);
  return useDelegatedAgents(source, jobs)[0]!;
}

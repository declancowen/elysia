import { useAtomValue } from "@effect/atom-react";
import { scopedProjectKey } from "@t3tools/client-runtime/environment";
import type { AgentConversationPreviewsResult, EnvironmentId, ProjectId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { useEffect, useMemo, useRef } from "react";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { projectEnvironment } from "../../state/projects";
import type { AgentRosterEntry } from "./useAgents";

/** Bounded snippets, batched by environment; transcript bodies stay out of shell hydration. */
export function useAgentConversationPreviews(agents: readonly AgentRosterEntry[]) {
  const batches = useMemo(() => {
    const groups = new Map<EnvironmentId, ProjectId[]>();
    for (const { project } of agents) {
      if (project.agentProfile?.archived) continue;
      const ids = groups.get(project.environmentId) ?? [];
      ids.push(project.id);
      groups.set(project.environmentId, ids);
    }
    return [...groups].flatMap(([environmentId, ids]) => {
      const sorted = [...new Set(ids)].sort();
      return Array.from({ length: Math.ceil(sorted.length / 100) }, (_, index) => {
        const projectIds = sorted.slice(index * 100, (index + 1) * 100);
        return { environmentId, projectIds, key: `${environmentId}:${projectIds.join(",")}` };
      });
    });
  }, [agents]);
  const queries = useMemo(
    () =>
      batches.map(({ environmentId, projectIds }) =>
        projectEnvironment.agentConversationPreviews({ environmentId, input: { projectIds } }),
      ),
    [batches],
  );
  const valuesAtom = useMemo(
    () => Atom.make((get) => queries.map((query) => get(query))),
    [queries],
  );
  const values = useAtomValue(valuesAtom);
  const revisions = useRef(new Map<string, { value: string; dirty: boolean }>());
  useEffect(() => {
    const liveKeys = new Set(batches.map((batch) => batch.key));
    for (const key of revisions.current.keys())
      if (!liveKeys.has(key)) revisions.current.delete(key);
    batches.forEach((batch, index) => {
      const value = agents
        .filter(
          ({ project }) =>
            project.environmentId === batch.environmentId && batch.projectIds.includes(project.id),
        )
        .map(
          ({ project, thread }) =>
            `${project.id}:${thread?.latestRun?.runId}:${thread?.latestRun?.status}:${thread?.latestUserMessageAt}:${project.agentProfile?.group ? thread?.updatedAt : ""}`,
        )
        .join("|");
      const previous = revisions.current.get(batch.key);
      const revision = {
        value,
        dirty: Boolean(previous && (previous.dirty || previous.value !== value)),
      };
      revisions.current.set(batch.key, revision);
      if (revision.dirty && values[index] && !values[index]!.waiting) {
        revision.dirty = false;
        appAtomRegistry.refresh(queries[index]!);
      }
    });
  }, [agents, batches, queries, values]);
  const previews = new Map<string, AgentConversationPreviewsResult[number]>();
  values.forEach((value, index) => {
    for (const preview of Option.getOrNull(AsyncResult.value(value)) ?? []) {
      previews.set(
        scopedProjectKey({
          environmentId: batches[index]!.environmentId,
          projectId: preview.projectId,
        }),
        preview,
      );
    }
  });
  return {
    previews,
    loading: values.some((value) => value.waiting),
    failed: values.some((value) => value._tag === "Failure"),
  };
}

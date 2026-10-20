import {
  ELYSIA_PROJECT_FILE_NAME,
  type EnvironmentId,
  LEGACY_PROJECT_FILE_NAME,
  type ElysiaProjectFile,
} from "@elysiatools/contracts";
import {
  isMissingProjectFileError,
  parseElysiaProjectFile,
} from "@elysiatools/shared/elysiaProjectFile";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { getProjectFileQueryAtom, optimisticFileAtom } from "../files/projectFilesQueryState";

export type ProjectFileMember = readonly [
  environmentId: EnvironmentId,
  workspaceRoot: string,
  physicalProjectKey: string,
];

// Keyed by member identity so rerenders do not restart file subscriptions.
export const memberProjectFilesAtom = Atom.family((membersKey: string) => {
  const members = JSON.parse(membersKey) as ReadonlyArray<ProjectFileMember>;
  return Atom.make((get) => {
    const files = new Map<string, ElysiaProjectFile | null>();
    for (const [environmentId, workspaceRoot, physicalProjectKey] of members) {
      let data = null;
      let waiting = false;
      for (const fileName of [ELYSIA_PROJECT_FILE_NAME, LEGACY_PROJECT_FILE_NAME]) {
        const result = get(getProjectFileQueryAtom(environmentId, workspaceRoot, fileName));
        const optimistic = get(optimisticFileAtom(environmentId, workspaceRoot, fileName))?.data;
        if (result.waiting && optimistic === undefined) {
          waiting = true;
          break;
        }
        data = optimistic ?? Option.getOrNull(AsyncResult.value(result));
        if (data?.exists === false) {
          data = null;
          continue;
        }
        if (data !== null) break;
        if (result._tag !== "Failure" || !isMissingProjectFileError(Cause.squash(result.cause)))
          break;
      }
      if (waiting) continue;
      files.set(
        physicalProjectKey,
        data === null || data.truncated ? null : parseElysiaProjectFile(data.contents),
      );
    }
    return files;
  }).pipe(Atom.withLabel(`web-settings-member-project-files:${membersKey}`));
});

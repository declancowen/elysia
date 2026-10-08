import {
  ELYSIA_PROJECT_FILE_NAME,
  LEGACY_PROJECT_FILE_NAME,
  type EnvironmentId,
  type ElysiaProjectFile,
} from "@elysiatools/contracts";
import {
  isMissingProjectFileError,
  parseElysiaProjectFile,
} from "@elysiatools/shared/elysiaProjectFile";
import * as Cause from "effect/Cause";
import { executeAtomQuery } from "@elysiatools/client-runtime/state/runtime";

import {
  getProjectFileQueryAtom,
  resolveProjectFileQueryData,
} from "~/components/files/projectFilesQueryState";
import { appAtomRegistry } from "~/rpc/atomRegistry";

/**
 * Read and decode the project's checked-in `elysia.json`.
 *
 * Imperative counterpart to `useElysiaProjectFileState` for the new-thread path,
 * which resolves defaults at call time rather than render time. The file
 * query atom caches per (environment, cwd), so repeat calls don't re-fetch.
 * Optimistic in-app writes overlay the query result, matching what
 * `useProjectFileQuery` renders. Missing, truncated, or invalid files
 * resolve to null.
 */
export async function readElysiaProjectFile(
  environmentId: EnvironmentId,
  workspaceRoot: string,
): Promise<ElysiaProjectFile | null> {
  for (const fileName of [ELYSIA_PROJECT_FILE_NAME, LEGACY_PROJECT_FILE_NAME]) {
    const result = await executeAtomQuery(
      appAtomRegistry,
      getProjectFileQueryAtom(environmentId, workspaceRoot, fileName),
      { reportDefect: false, reportFailure: false },
    );
    const data = resolveProjectFileQueryData(
      environmentId,
      workspaceRoot,
      fileName,
      result._tag === "Success" ? result.value : null,
    );
    if (data !== null) return data.truncated ? null : parseElysiaProjectFile(data.contents);
    if (result._tag !== "Failure" || !isMissingProjectFileError(Cause.squash(result.cause)))
      return null;
  }
  return null;
}

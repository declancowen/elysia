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
    if (data !== null && data.exists !== false)
      return data.truncated ? null : parseElysiaProjectFile(data.contents);
    if (data?.exists === false) continue;
    if (result._tag !== "Failure" || !isMissingProjectFileError(Cause.squash(result.cause)))
      return null;
  }
  return null;
}

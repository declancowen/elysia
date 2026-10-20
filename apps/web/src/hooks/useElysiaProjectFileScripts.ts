import {
  ELYSIA_PROJECT_FILE_NAME,
  LEGACY_PROJECT_FILE_NAME,
  type EnvironmentId,
  type ElysiaProjectFile,
  type ElysiaProjectFileScript,
} from "@elysiatools/contracts";
import {
  isMissingProjectFileError,
  parseElysiaProjectFile,
} from "@elysiatools/shared/elysiaProjectFile";

import { useProjectFileQuery } from "~/components/files/projectFilesQueryState";

const NO_SCRIPTS: ReadonlyArray<ElysiaProjectFileScript> = [];

export interface ElysiaProjectFileState {
  status: "loading" | "missing" | "invalid" | "valid";
  file: ElysiaProjectFile | null;
  scripts: ReadonlyArray<ElysiaProjectFileScript>;
}

export function useElysiaProjectFileState(
  environmentId: EnvironmentId,
  cwd: string | null,
): ElysiaProjectFileState {
  const primary = useProjectFileQuery(
    environmentId,
    cwd ?? "",
    ELYSIA_PROJECT_FILE_NAME,
    cwd !== null,
  );
  const useLegacy =
    (primary.data?.exists === false ||
      (primary.data === null && isMissingProjectFileError(primary.readError))) &&
    !primary.isPending;
  const legacy = useProjectFileQuery(
    environmentId,
    cwd ?? "",
    LEGACY_PROJECT_FILE_NAME,
    cwd !== null && useLegacy,
  );
  const query = useLegacy ? legacy : primary;
  const contents =
    query.data && query.data.exists !== false && !query.data.truncated ? query.data.contents : null;
  const isPending = query.isPending;
  if (contents === null) {
    return {
      status: isPending ? "loading" : "missing",
      file: null,
      scripts: NO_SCRIPTS,
    } as const;
  }
  const file = parseElysiaProjectFile(contents);
  if (file === null) {
    return { status: "invalid", file: null, scripts: NO_SCRIPTS } as const;
  }
  return { status: "valid", file, scripts: file.scripts ?? NO_SCRIPTS } as const;
}

export function useElysiaProjectFileScripts(
  environmentId: EnvironmentId,
  cwd: string | null,
): ReadonlyArray<ElysiaProjectFileScript> {
  return useElysiaProjectFileState(environmentId, cwd).scripts;
}

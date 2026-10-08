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
import { useMemo } from "react";

import { useProjectFileQuery } from "~/components/files/projectFilesQueryState";

const NO_SCRIPTS: ReadonlyArray<ElysiaProjectFileScript> = [];

export interface ElysiaProjectFileState {
  /**
   * - `valid`: elysia.json exists and decoded.
   * - `invalid`: elysia.json exists but fails to decode (the server then ignores
   *   the whole file, including `iconPath` and every script).
   * - `missing`: no readable elysia.json at the workspace root.
   * - `loading`: the file query has not settled yet.
   */
  status: "loading" | "missing" | "invalid" | "valid";
  /** The decoded file when status is `valid`, null otherwise. */
  file: ElysiaProjectFile | null;
  scripts: ReadonlyArray<ElysiaProjectFileScript>;
}

/**
 * Decoded state of the project's checked-in `elysia.json`, including whether the
 * file exists but is broken — which the runtime otherwise swallows silently.
 */
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
    primary.data === null && !primary.isPending && isMissingProjectFileError(primary.readError);
  const legacy = useProjectFileQuery(
    environmentId,
    cwd ?? "",
    LEGACY_PROJECT_FILE_NAME,
    cwd !== null && useLegacy,
  );
  const query = useLegacy ? legacy : primary;
  const contents = query.data && !query.data.truncated ? query.data.contents : null;
  const isPending = query.isPending;
  return useMemo(() => {
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
  }, [contents, isPending]);
}

/**
 * Scripts declared in the project's checked-in `elysia.json`, offered in the
 * scripts menu for import. Missing, truncated, or invalid files resolve to
 * an empty list.
 */
export function useElysiaProjectFileScripts(
  environmentId: EnvironmentId,
  cwd: string | null,
): ReadonlyArray<ElysiaProjectFileScript> {
  return useElysiaProjectFileState(environmentId, cwd).scripts;
}

import { useMemo } from "react";
import { Atom } from "effect/reactivity";
import * as Cause from "effect/Cause";
import { resolveFilesystemReadAccess } from "@elysiatools/client-runtime/state/filesystem";
import { isScratchProject } from "@elysiatools/client-runtime/state/projects";
import type { EnvironmentProject } from "@elysiatools/client-runtime/state/shell";
import type { ProjectReadFileResult } from "@elysiatools/contracts";
import {
  DEFAULT_SERVER_SETTINGS,
  ELYSIA_PROJECT_FILE_NAME,
  LEGACY_PROJECT_FILE_NAME,
} from "@elysiatools/contracts";
import {
  resolveNewThreadEnvMode,
  resolveProjectSettings,
} from "@elysiatools/shared/projectSettings";
import {
  isMissingProjectFileError,
  parseElysiaProjectFile,
} from "@elysiatools/shared/elysiaProjectFile";

import { useEnvironmentServerConfig } from "../../state/entities";
import { useEnvironmentPresentation } from "../../state/presentation";
import { useProjectHasThreads } from "../../state/project-has-threads";
import { projectEnvironment } from "../../state/projects";
import { useEnvironmentQuery } from "../../state/query";
import { environmentSession } from "../../state/session";

/**
 * A project's new-task defaults: server settings merged with its elysia.json. The
 * new-task flow and the home pending-drafts list both read the default
 * workspace mode here, so a draft that never picked one shows what it sends.
 * Every read is a shared per-environment or per-project atom.
 */
export function useNewTaskProjectDefaults(project: EnvironmentProject | null) {
  const serverConfig = useEnvironmentServerConfig(project?.environmentId ?? null);
  const isScratch =
    project !== null && isScratchProject(project, serverConfig?.scratchWorkspaceRoot);
  const hasWorkspace = project !== null && project.workspaceRoot !== "";
  const fileAccessSession = useEnvironmentQuery(
    hasWorkspace ? environmentSession.sessionStateAtom(project.environmentId) : null,
  );
  const fileEnvironment = useEnvironmentPresentation(project?.environmentId ?? null);
  const fileAccess = resolveFilesystemReadAccess({
    isCatalogReady: fileEnvironment.isReady,
    connection: fileEnvironment.presentation?.connection ?? null,
    session: fileAccessSession.data,
    sessionError: fileAccessSession.error,
  });
  const fileAccessPending = hasWorkspace && fileAccess.isPending;
  const projectFileAtom = useMemo(
    () =>
      fileAccess.canReadFiles && project !== null && project.workspaceRoot !== ""
        ? Atom.make((get) => {
            const read = (relativePath: string) =>
              get(
                projectEnvironment.readFile({
                  environmentId: project.environmentId,
                  input: { cwd: project.workspaceRoot, relativePath, allowMissing: true },
                }),
              );
            const primary = read(ELYSIA_PROJECT_FILE_NAME);
            return (primary._tag === "Success" && primary.value.exists === false) ||
              (primary._tag === "Failure" &&
                !primary.waiting &&
                isMissingProjectFileError(Cause.squash(primary.cause)))
              ? read(LEGACY_PROJECT_FILE_NAME)
              : primary;
          })
        : null,
    [fileAccess.canReadFiles, project],
  );
  const elysiaProjectFileQuery = useEnvironmentQuery(projectFileAtom);
  const elysiaProjectFileData = elysiaProjectFileQuery.data as ProjectReadFileResult | null;
  const elysiaProjectFile =
    elysiaProjectFileData === null ||
    elysiaProjectFileData.exists === false ||
    elysiaProjectFileData.truncated
      ? null
      : parseElysiaProjectFile(elysiaProjectFileData.contents);
  const projectSettings = resolveProjectSettings(
    serverConfig?.settings ?? DEFAULT_SERVER_SETTINGS,
    project?.id ?? null,
    project,
    elysiaProjectFile,
  );
  const projectHasThreads = useProjectHasThreads(project);
  const defaultWorkspaceMode = isScratch
    ? "local"
    : resolveNewThreadEnvMode({
        projectSettings,
        workspaceRoot: project?.workspaceRoot ?? null,
        newProjectsRoot: serverConfig?.newProjectsRoot,
        projectHasThreads,
      });
  // While elysia.json loads, the environment default is provisional; elysia.json may replace it.
  const defaultWorkspaceModeSettled =
    projectSettings.sources.defaultThreadEnvMode !== "environment" ||
    (!elysiaProjectFileQuery.isPending && !fileAccessPending);
  return {
    serverConfig,
    isScratch,
    projectSettings,
    defaultWorkspaceMode,
    defaultWorkspaceModeSettled,
  };
}

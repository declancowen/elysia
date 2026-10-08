import {
  ELYSIA_PROJECT_FILE_NAME,
  LEGACY_PROJECT_FILE_NAME,
  type ElysiaProjectFile,
} from "@elysiatools/contracts";
import {
  isMissingProjectFileError,
  parseElysiaProjectFile,
} from "@elysiatools/shared/elysiaProjectFile";
import { useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { createContext, type ReactNode, useContext, useMemo } from "react";

import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { getProjectFileQueryAtom, optimisticFileAtom } from "../files/projectFilesQueryState";
import { useSettingsProjectGroups } from "./useSettingsProjectGroups";
import { resolveScopedSettingsTargets, selectScopedSettingsEnvironments } from "./scopedSettings";
import { resolveSettingsScope, type SettingsScopeSearch } from "./settingsScope";
import { selectSingleEnvironmentScope } from "./settingsScopeAxis";

/**
 * Each member's decoded elysia.json, so file-backed settings show the file as a
 * layer in the inheritance chain. A member is only present once its read has
 * settled; the query atom caches per (environment, cwd).
 */
function useMemberProjectFiles(scope: ReturnType<typeof resolveSettingsScope>) {
  const members = scope.kind === "project" || scope.kind === "checkout" ? scope.members : [];
  return useAtomValue(
    useMemo(
      () =>
        Atom.make((get) => {
          const files = new Map<string, ElysiaProjectFile | null>();
          for (const member of members) {
            let data = null;
            let waiting = false;
            for (const fileName of [ELYSIA_PROJECT_FILE_NAME, LEGACY_PROJECT_FILE_NAME]) {
              const result = get(
                getProjectFileQueryAtom(member.environmentId, member.workspaceRoot, fileName),
              );
              data =
                get(optimisticFileAtom(member.environmentId, member.workspaceRoot, fileName))
                  ?.data ?? Option.getOrNull(AsyncResult.value(result));
              if (data !== null) break;
              if (result.waiting) {
                waiting = true;
                break;
              }
              if (
                result._tag !== "Failure" ||
                !isMissingProjectFileError(Cause.squash(result.cause))
              )
                break;
            }
            if (waiting) continue;
            files.set(
              member.physicalProjectKey,
              data === null || data.truncated ? null : parseElysiaProjectFile(data.contents),
            );
          }
          return files;
        }),
      [members],
    ),
  );
}

function useResolvedSettingsScope(rawSearch: SettingsScopeSearch, singleEnvironment: boolean) {
  const groups = useSettingsProjectGroups();
  const { environments: availableEnvironments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const search = useMemo(
    () =>
      singleEnvironment
        ? selectSingleEnvironmentScope(
            rawSearch,
            resolveSettingsScope(rawSearch, groups, availableEnvironments),
            availableEnvironments,
            primaryEnvironmentId,
          )
        : rawSearch,
    [availableEnvironments, groups, primaryEnvironmentId, rawSearch, singleEnvironment],
  );
  const scope = useMemo(
    () => resolveSettingsScope(search, groups, availableEnvironments),
    [availableEnvironments, groups, search],
  );
  const projectFiles = useMemberProjectFiles(scope);
  return useMemo(() => {
    const selected = selectScopedSettingsEnvironments(
      scope,
      availableEnvironments,
      primaryEnvironmentId,
    );
    const targets = resolveScopedSettingsTargets(
      scope,
      selected.connectedEnvironments,
      projectFiles,
    );
    // The representative target supplies display values; project scopes
    // prefer the member on the primary environment, like environments do.
    const target =
      targets.find(
        (candidate) => candidate.environmentId === selected.environment?.environmentId,
      ) ??
      targets[0] ??
      null;
    return { scope, groups, search, ...selected, targets, target };
  }, [availableEnvironments, groups, primaryEnvironmentId, projectFiles, scope, search]);
}

const SettingsScopeContext = createContext<
  | (ReturnType<typeof useResolvedSettingsScope> & {
      singleEnvironment: boolean;
      search: SettingsScopeSearch;
      selectScope: (next: SettingsScopeSearch) => void;
    })
  | null
>(null);

export function SettingsScopeProvider({
  search,
  onChange,
  children,
  singleEnvironment = false,
}: {
  singleEnvironment?: boolean;
  search: SettingsScopeSearch;
  onChange: (next: SettingsScopeSearch) => void;
  children: ReactNode;
}) {
  const resolved = useResolvedSettingsScope(search, singleEnvironment);
  const value = useMemo(
    () => ({ ...resolved, singleEnvironment, selectScope: onChange }),
    [onChange, resolved, singleEnvironment],
  );
  return <SettingsScopeContext value={value}>{children}</SettingsScopeContext>;
}

export function useOptionalSettingsScope() {
  return useContext(SettingsScopeContext);
}

export function useSettingsScope() {
  const scope = useOptionalSettingsScope();
  if (scope === null) throw new Error("Settings scope must be read inside SettingsScopeProvider.");
  return scope;
}

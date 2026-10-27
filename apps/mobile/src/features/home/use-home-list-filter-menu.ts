import * as Arr from "effect/Array";
import * as Order from "effect/Order";
import { useMemo } from "react";

import { resolveScratchProjectScopeKey } from "@elysiatools/client-runtime/state/project-grouping";
import { useSavedRemoteConnections } from "../../state/use-remote-environment-registry";
import { useRegularProjects } from "../agents/use-agent-catalog";
import { buildHomeListFilterMenu } from "./home-list-filter-menu";
import { useHomeListOptions } from "./home-list-options";
import { buildHomeProjectScopes } from "./homeThreadList";

export function useHomeListFilterMenu() {
  const projects = useRegularProjects();
  const { savedConnectionsById } = useSavedRemoteConnections();
  const environments = useMemo(
    () =>
      Arr.sort(
        Object.values(savedConnectionsById).map((connection) => ({
          environmentId: connection.environmentId,
          label: connection.environmentLabel,
        })),
        Order.mapInput(
          Order.String,
          (environment: { readonly label: string }) => environment.label,
        ),
      ),
    [savedConnectionsById],
  );
  const availableEnvironmentIds = useMemo(
    () => new Set(environments.map((environment) => environment.environmentId)),
    [environments],
  );
  const { options, setSelectedEnvironmentId, setSelectedProjectKey } =
    useHomeListOptions(availableEnvironmentIds);
  const resolvedProjectKey = resolveScratchProjectScopeKey(options.selectedProjectKey, projects, {
    sidebarProjectGroupingMode: options.projectGroupingMode,
    sidebarProjectGroupingOverrides: {},
  });
  const projectOptions = useMemo(
    () =>
      buildHomeProjectScopes({
        projects,
        environmentId: options.selectedEnvironmentId,
        projectGroupingMode: options.projectGroupingMode,
      }).map((scope) => ({ key: scope.key, label: scope.title })),
    [projects, options.selectedEnvironmentId, options.projectGroupingMode],
  );
  const selectedProject = projectOptions.find((project) => project.key === resolvedProjectKey);
  const selectedEnvironment = environments.find(
    (environment) => environment.environmentId === options.selectedEnvironmentId,
  );
  return {
    ...buildHomeListFilterMenu({
      environments,
      projects: projectOptions,
      selectedEnvironmentId: options.selectedEnvironmentId,
      selectedProjectKey: selectedProject?.key ?? null,
      onEnvironmentChange: setSelectedEnvironmentId,
      onProjectChange: setSelectedProjectKey,
    }),
    label: [selectedEnvironment?.label, selectedProject?.label].filter(Boolean).join(", "),
  };
}

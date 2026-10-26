import { SINGLE_PROVIDER_UI } from "@elysiatools/contracts";
import { useProjects } from "../../state/entities";
import { selectRegularProjects } from "../../agentPresentation";
import { isScratchProject } from "@elysiatools/client-runtime/state/projects";

import { useClientSettings } from "../../hooks/useSettings";
import { buildSidebarProjectSnapshots } from "../../sidebarProjectGrouping";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";

export function useSettingsProjectGroups() {
  const projects = useProjects();
  // Avoid object selector identities that rebuild groups and every settings row on each write.
  const sidebarProjectGroupingMode = useClientSettings(
    (settings) => settings.sidebarProjectGroupingMode,
  );
  const sidebarProjectGroupingOverrides = useClientSettings(
    (settings) => settings.sidebarProjectGroupingOverrides,
  );
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const labels = new Map(environments.map((entry) => [entry.environmentId, entry.label]));
  return buildSidebarProjectSnapshots({
    projects: SINGLE_PROVIDER_UI
      ? projects.filter((project) => !project.agentProfile?.archived)
      : selectRegularProjects(projects),
    settings: { sidebarProjectGroupingMode, sidebarProjectGroupingOverrides },
    primaryEnvironmentId,
    resolveEnvironmentLabel: (id) => labels.get(id) ?? null,
  })
    .map((group) =>
      isScratchProject(
        group,
        environments.find((entry) => entry.environmentId === group.environmentId)?.serverConfig
          ?.scratchWorkspaceRoot,
      )
        ? { ...group, displayName: "Chats" }
        : group,
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

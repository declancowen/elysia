import { SINGLE_PROVIDER_UI } from "@t3tools/contracts";
import { useProjects } from "../../state/entities";
import { selectRegularProjects } from "../../agentPresentation";
import { useMemo } from "react";
import { isScratchProject } from "@t3tools/client-runtime/state/projects";

import { useClientSettings } from "../../hooks/useSettings";
import { selectProjectGroupingSettings } from "../../logicalProject";
import { buildSidebarProjectSnapshots } from "../../sidebarProjectGrouping";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";

/** Settings uses the same logical projects as the sidebar, sorted by display name. */
export function useSettingsProjectGroups() {
  const projects = useProjects();
  const settings = useClientSettings(selectProjectGroupingSettings);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  return useMemo(() => {
    const labels = new Map(environments.map((entry) => [entry.environmentId, entry.label]));
    return buildSidebarProjectSnapshots({
      projects: SINGLE_PROVIDER_UI
        ? projects.filter((project) => !project.agentProfile?.archived)
        : selectRegularProjects(projects),
      settings,
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
  }, [environments, primaryEnvironmentId, projects, settings]);
}

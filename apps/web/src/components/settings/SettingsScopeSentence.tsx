import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { SINGLE_PROVIDER_UI, resolveEnvironmentMachineKind } from "@t3tools/contracts";
import { isScratchProject } from "@t3tools/client-runtime/state/projects";
import { useLocation } from "@tanstack/react-router";
import { ChevronDownIcon, LayersIcon, MessageCircleIcon } from "~/icons";
import type { ReactNode } from "react";

import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { useEnvironments, type EnvironmentPresentation } from "../../state/environments";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { AgentAvatar } from "../agents/AgentAvatar";
import { AgentDetailsPopover } from "../agents/AgentDetailsPopover";
import { ProjectFavicon } from "../ProjectFavicon";
import { InlineButton } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { useOptionalSettingsScope } from "./SettingsScopeContext";
import { resolveSettingsScope, type SettingsScopeSearch } from "./settingsScope";
import {
  ALL_ENVIRONMENTS_VALUE,
  ALL_PROJECTS_VALUE,
  environmentAxisValue,
  projectAxisValue,
  selectEnvironmentAxis,
  selectProjectAxis,
  settingsScopeEnvironmentLabel,
} from "./settingsScopeAxis";

/** Pages whose every row is saved on this client; they have no scope to pick. */
export const SETTINGS_DEVICE_ONLY_PATHS: ReadonlySet<string> = new Set([
  "/settings/appearance",
  "/settings/snap-shot",
  "/settings/connections",
]);

interface SettingsScopeMenuProps {
  readonly value: SettingsScopeSearch;
  readonly groups: readonly SidebarProjectSnapshot[];
  readonly environments: readonly EnvironmentPresentation[];
  readonly singleEnvironment: boolean;
  readonly onChange: (next: SettingsScopeSearch) => void;
}

/**
 * "Applying settings for <project> across <environment>" at the top of a settings
 * page. The two pickers are the targets a change is written to. A project is
 * the same project on every environment, so the environment alone decides
 * where a project override is written.
 */
export function SettingsScopeSentence({ compact = false }: { compact?: boolean } = {}) {
  const scope = useOptionalSettingsScope();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { environments } = useEnvironments();
  if (scope === null || SETTINGS_DEVICE_ONLY_PATHS.has(pathname)) return null;
  const selectedAgent = scope.groups.find(
    (group) => group.projectKey === scope.search.project && group.agentProfile,
  );
  const props: SettingsScopeMenuProps = {
    value: scope.search,
    singleEnvironment: scope.singleEnvironment,
    groups: scope.groups,
    environments,
    onChange: scope.selectScope,
  };
  if (compact) return <ProjectScopeMenu {...props} allProjectsLabel="All tasks" />;
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 px-3 text-base text-muted-foreground sm:px-4">
      {/* Each connective stays with its picker so a wrap never strands "on". */}
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0">Applying settings for</span>
        <ProjectScopeMenu {...props} />
        {selectedAgent ? (
          <AgentDetailsPopover
            key={selectedAgent.projectKey}
            projectRef={scopeProjectRef(selectedAgent.environmentId, selectedAgent.id)}
            defaultOpen={pathname !== "/settings/scheduled-tasks"}
          />
        ) : null}
      </span>
      {!SINGLE_PROVIDER_UI && (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0">
            {/* A legacy checkout link names one environment without `machine`. */}
            {scope.search.machine || scope.scope.kind === "checkout" ? "on" : "across"}
          </span>
          <EnvironmentScopeMenu {...props} />
        </span>
      )}
    </p>
  );
}

function ScopeMenu({
  ariaLabel,
  icon,
  label,
  children,
}: {
  ariaLabel: string;
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <Menu>
      <MenuTrigger
        aria-label={`${ariaLabel}: ${label}`}
        render={<InlineButton tone="picker" />}
        className="min-w-0 max-w-72"
      >
        {icon}
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDownIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup align="start">{children}</MenuPopup>
    </Menu>
  );
}

function EnvironmentScopeMenu({
  value,
  groups,
  environments,
  onChange,
  singleEnvironment,
}: SettingsScopeMenuProps) {
  const resolved = resolveSettingsScope(value, groups, environments);
  const environmentValue = environmentAxisValue(
    value,
    resolved.kind === "checkout" ? resolved.environmentId : null,
  );
  const selected = environments.find(
    (environment) => environment.environmentId === environmentValue,
  );
  return (
    <ScopeMenu
      ariaLabel="Environment scope"
      icon={
        selected ? (
          <EnvironmentMachineIcon
            aria-hidden
            kind={resolveEnvironmentMachineKind(selected.serverConfig)}
            className="size-3.5 shrink-0"
          />
        ) : null
      }
      label={
        selected
          ? settingsScopeEnvironmentLabel(selected, environments)
          : environmentValue !== ALL_ENVIRONMENTS_VALUE
            ? "Unavailable environment"
            : singleEnvironment
              ? "No environments"
              : "All environments"
      }
    >
      <MenuRadioGroup
        value={environmentValue}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(selectEnvironmentAxis(value, next));
        }}
      >
        {!singleEnvironment ? (
          <>
            <MenuRadioItem value={ALL_ENVIRONMENTS_VALUE}>
              <span className="flex min-w-0 items-center gap-2">
                <LayersIcon aria-hidden className="size-3.5" />
                <span className="min-w-0 flex-1 truncate">All environments</span>
                <MenuRadioItemIndicator />
              </span>
            </MenuRadioItem>
            <MenuSeparator />
          </>
        ) : null}
        {environments.map((environment) => (
          <MenuRadioItem key={environment.environmentId} value={environment.environmentId}>
            <span className="flex min-w-0 items-center gap-2">
              <EnvironmentMachineIcon
                aria-hidden
                kind={resolveEnvironmentMachineKind(environment.serverConfig)}
                className="size-3.5"
              />
              <span className="min-w-0 flex-1 truncate">
                {settingsScopeEnvironmentLabel(environment, environments)}
              </span>
              {environment.connection.phase === "connected" ? null : (
                <span className="shrink-0 text-xs text-muted-foreground">Offline</span>
              )}
              <MenuRadioItemIndicator />
            </span>
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </ScopeMenu>
  );
}

function ProjectScopeMenu({
  value,
  groups,
  environments,
  onChange,
  allProjectsLabel,
}: SettingsScopeMenuProps & { allProjectsLabel?: string }) {
  const selected = groups.find((group) => group.projectKey === value.project);
  const projectIcon = (group: SidebarProjectSnapshot) =>
    group.agentProfile ? (
      <AgentAvatar avatar={group.agentProfile.avatar} className="size-3.5 shrink-0" />
    ) : isScratchProject(
        group,
        environments.find((entry) => entry.environmentId === group.environmentId)?.serverConfig
          ?.scratchWorkspaceRoot,
      ) ? (
      <MessageCircleIcon aria-hidden className="size-3.5 shrink-0" />
    ) : (
      <ProjectFavicon project={group} className="size-3.5 shrink-0" />
    );
  return (
    <ScopeMenu
      ariaLabel={SINGLE_PROVIDER_UI ? "Settings scope" : "Project scope"}
      icon={selected ? projectIcon(selected) : null}
      label={
        selected?.displayName ??
        (value.project
          ? "Unavailable project"
          : (allProjectsLabel ?? (SINGLE_PROVIDER_UI ? "App defaults" : "All projects")))
      }
    >
      <MenuRadioGroup
        value={projectAxisValue(value)}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(selectProjectAxis(value, next));
        }}
      >
        <MenuRadioItem value={ALL_PROJECTS_VALUE}>
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate">
              {allProjectsLabel ?? (SINGLE_PROVIDER_UI ? "App defaults" : "All projects")}
            </span>
            <MenuRadioItemIndicator />
          </span>
        </MenuRadioItem>
        <MenuSeparator />
        {groups
          .filter((group) => !group.agentProfile)
          .map((group) => (
            <MenuRadioItem key={group.projectKey} value={group.projectKey}>
              <span className="flex min-w-0 items-center gap-2">
                {projectIcon(group)}
                <span className="min-w-0 flex-1 truncate">{group.displayName}</span>
                <MenuRadioItemIndicator />
              </span>
            </MenuRadioItem>
          ))}
        {groups.some((group) => group.agentProfile) ? (
          <MenuGroup>
            <MenuSeparator />
            <MenuGroupLabel>Agents</MenuGroupLabel>
            {groups
              .filter((group) => group.agentProfile)
              .map((group) => (
                <MenuRadioItem key={group.projectKey} value={group.projectKey}>
                  <span className="flex min-w-0 items-center gap-2">
                    {projectIcon(group)}
                    <span className="min-w-0 flex-1 truncate">{group.displayName}</span>
                    <MenuRadioItemIndicator />
                  </span>
                </MenuRadioItem>
              ))}
          </MenuGroup>
        ) : null}
      </MenuRadioGroup>
    </ScopeMenu>
  );
}

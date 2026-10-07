import { useDebouncedValue } from "~/state/queries";
import { useState } from "react";
import { LayersIcon, Plug2Icon, ArrowDownUpIcon } from "~/icons";
import { useRegularProjects } from "~/hooks/useRegularProjects";
import { getSourceControlPresentationForKind } from "~/sourceControlPresentation";
import {
  CompactFilterMenu,
  PullRequestRefreshControl,
  INVOLVEMENT_TABS,
  STATE_TABS,
  SORT_OPTIONS,
} from "./PullRequestSidebarControls";
import {
  PullRequestFiltersMenu,
  PullRequestSearchInput,
  pullRequestHostLabel,
} from "./PullRequestListFilters";
import {
  parsePullRequestQuery,
  collectPullRequestListFacets,
  sortPullRequestGroups,
} from "./pullRequestList.logic";
import {
  writePullRequestListPreferences,
  pullRequestListPreferences,
  type PullRequestListPreferencePatch,
} from "./pullRequestListPreferences";
import { useNavigate } from "@tanstack/react-router";
import { useEnvironments } from "~/state/environments";
import { usePullRequestList } from "~/state/pullRequests";
import { useConversationTabsStore } from "~/conversationTabsStore";
import { useConversationTabNavigation } from "~/hooks/useConversationTabNavigation";
import { SidebarContent } from "../ui/sidebar";
import { PullRequestRow, type PullRequestRowTarget } from "./PullRequestRow";
import { PullRequestSidebarGroup } from "./PullRequestSidebarGroup";
import { groupPullRequestsByInvolvement, pullRequestEntryKey } from "./pullRequestList.logic";
import { readPullRequestListPreferences } from "./pullRequestListPreferences";

export function PullRequestsHoverSidebar() {
  const { environments } = useEnvironments();
  const navigate = useNavigate();
  const navigateTab = useConversationTabNavigation();
  const [preferences, setPreferences] = useState(readPullRequestListPreferences);
  const projects = useRegularProjects(false);
  const update = (patch: PullRequestListPreferencePatch) => {
    const next = pullRequestListPreferences({
      ...preferences,
      ...patch,
      state: patch.state ?? preferences.state,
      involvement: patch.involvement ?? preferences.involvement,
    });
    writePullRequestListPreferences(next);
    setPreferences(next);
  };
  const sentQuery = useDebouncedValue(preferences.q ?? "", 250);
  const parsed = parsePullRequestQuery(sentQuery);
  const filters = {
    ...(preferences.draft ? { draft: preferences.draft } : {}),
    ...(preferences.review ? { review: preferences.review } : {}),
    ...(preferences.checks ? { checks: preferences.checks } : {}),
    ...(preferences.author ? { author: preferences.author } : {}),
    ...(preferences.labels ? { labels: preferences.labels.map((label) => [label]) } : {}),
    ...parsed.filters,
  };
  const query = usePullRequestList(
    environments
      .filter(
        (environment) =>
          environment.serverConfig?.environment.capabilities.pullRequests === true &&
          (!preferences.environmentId || preferences.environmentId === environment.environmentId),
      )
      .map((environment) => ({
        environmentId: environment.environmentId,
        input: {
          state: preferences.state,
          involvement: preferences.involvement,
          ...(preferences.projectId ? { projectId: preferences.projectId } : {}),
          ...(preferences.host ? { host: preferences.host } : {}),
          ...(parsed.text ? { query: parsed.text } : {}),
          filters,
          limit: 99,
        },
      })),
  );
  const groups = sortPullRequestGroups(
    groupPullRequestsByInvolvement(query.data?.entries ?? [], query.data?.viewers ?? {}),
    preferences.sort ?? "ready",
    preferences.q ?? "",
  );
  const facets = collectPullRequestListFacets(query.data?.entries ?? [], preferences.state);
  const hosts = query.data?.providers ?? [];
  const hostOptions = [
    { value: "", label: "All", Icon: Plug2Icon },
    ...hosts.map((entry) => ({
      value: entry.host,
      label: pullRequestHostLabel(hosts, entry),
      Icon: getSourceControlPresentationForKind(entry.kind).Icon,
    })),
  ];
  const serverOptions = [
    { value: "", label: "All servers", Icon: LayersIcon },
    ...environments.map((environment) => ({
      value: environment.environmentId,
      label: environment.label,
      Icon: LayersIcon,
    })),
  ];
  const select = (entry: PullRequestRowTarget, newTab = false) => {
    if (newTab) {
      const target = { kind: "pull-request", ...entry } as const;
      useConversationTabsStore.getState().open(target, true);
      void navigateTab(target);
    } else
      void navigate({
        to: "/pull-requests",
        search: {
          ...preferences,
          repository: entry.repository,
          number: entry.number,
          selectedProjectId: entry.projectId,
          selectedHost: entry.host,
          selectedEnvironmentId: entry.environmentId,
        },
      });
  };
  return (
    <>
      <div className="flex h-11 shrink-0 items-center justify-between px-3">
        <h2 className="min-w-0 truncate pl-1.5 text-base font-medium">Pull requests</h2>
        <div className="flex shrink-0 items-center gap-1">
          <CompactFilterMenu
            label="Sort pull requests"
            triggerIcon={<ArrowDownUpIcon aria-hidden className="size-4" />}
            triggerLabel="Sort"
            iconOnly
            outlined
            value={preferences.sort ?? "ready"}
            options={SORT_OPTIONS}
            onChange={(sort) => update({ sort })}
          />
          <PullRequestFiltersMenu
            iconOnly
            state={preferences.state}
            stateOptions={STATE_TABS}
            onState={(state) => update({ state })}
            involvement={preferences.involvement}
            involvementOptions={INVOLVEMENT_TABS}
            onInvolvement={(involvement) => update({ involvement })}
            filters={filters}
            onFilters={(next) =>
              update({
                draft: next.draft,
                review: next.review,
                checks: next.checks,
                author: next.author,
                labels: next.labels?.flatMap((group) => group),
              })
            }
            authorOptions={facets.authors}
            labelOptions={facets.labels}
            host={preferences.host}
            hostOptions={hostOptions}
            onHost={(host) => update({ host })}
            server={preferences.environmentId}
            serverOptions={serverOptions}
            onServer={(environmentId) => update({ environmentId, projectId: undefined })}
            projects={projects}
            projectId={preferences.projectId}
            projectEnvironmentId={preferences.environmentId}
            unavailable={new Map()}
            onProject={(projectId, environmentId) =>
              update({ projectId, ...(environmentId ? { environmentId } : {}) })
            }
          />
          <CompactFilterMenu
            label="Filter by provider"
            outlined
            iconOnly
            triggerLabel="All"
            value={preferences.host ?? ""}
            options={hostOptions}
            onChange={(host) => update({ host: host || undefined })}
          />
          <PullRequestRefreshControl
            compact
            refreshing={query.isPending}
            onRefresh={() => query.refresh()}
          />
        </div>
      </div>
      <div className="shrink-0 px-3 pt-2 pb-4">
        <PullRequestSearchInput
          value={preferences.q ?? ""}
          busy={query.isPending}
          onChange={(q) => update({ q: q || undefined })}
        />
      </div>
      <SidebarContent>
        <div className="space-y-4 p-2">
          {groups.map((group) => (
            <PullRequestSidebarGroup key={group.key} group={group}>
              {group.entries.map((entry) => (
                <PullRequestRow
                  key={pullRequestEntryKey(entry)}
                  entry={entry}
                  selected={false}
                  showProjectTitle
                  showProvider={false}
                  onSelect={select}
                  speedMode={false}
                  onActed={() => query.refresh()}
                />
              ))}
            </PullRequestSidebarGroup>
          ))}
          {!groups.length ? (
            <p role="status" className="px-2.5 py-2 text-sm text-muted-foreground">
              {query.error ?? (query.isPending ? "Loading pull requests…" : "No pull requests.")}
            </p>
          ) : null}
        </div>
      </SidebarContent>
    </>
  );
}

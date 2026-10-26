import { matchComposerThreadItems } from "@elysiatools/client-runtime/composerThreadItems";
import { useEffect, useState } from "react";
import { useAgents } from "../agents/useAgents";
import { useRegularProjects } from "~/hooks/useRegularProjects";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import type {
  EnvironmentId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  PullRequestListInput,
  ServerProvider,
  ThreadId,
  ThreadPullRequestLink,
} from "@elysiatools/contracts";
import {
  composerPullRequestsFromLinks,
  filterComposerPullRequestMatches,
} from "@elysiatools/shared/composerPullRequestMatches";
import { formatProviderSkillDisplayName } from "@elysiatools/shared/inlineSkills";

import type { ComposerTrigger } from "../../composer-logic";
import { basenameOfPath } from "../../pierre-icons";
import {
  getProviderSkillsForSlashMenu,
  getProviderSlashCommandsForSlashMenu,
} from "@elysiatools/client-runtime/providerSkills";
import { searchProviderSkills } from "../../providerSkillSearch";
import { useThreadShells } from "~/state/entities";
import {
  pullRequestEnvironment,
  usePullRequestList,
  type EnvironmentQueryTarget,
} from "~/state/pullRequests";
import { useEnvironmentQuery } from "~/state/query";
import { useComposerPathSearch, useDebouncedValue, useThreadSearch } from "~/state/queries";
import {
  matchesPullRequestQuery,
  rankPullRequestMatches,
} from "../pullRequest/pullRequestList.logic";
import type { ComposerCommandItem } from "./ComposerCommandMenu";
import {
  searchSlashCommandItems,
  slashCommandItemsForPromptPosition,
} from "./composerSlashCommandSearch";

const COMPOSER_PULL_REQUEST_LIST_LIMIT = 99;
const COMPOSER_PULL_REQUEST_RESULT_LIMIT = 12;
const EMPTY_PULL_REQUEST_LIST_TARGETS: ReadonlyArray<EnvironmentQueryTarget<PullRequestListInput>> =
  [];

/** Builds the @, /, $ and # suggestion lists, running the searches each trigger needs. */
export function useComposerMenuItems({
  composerTrigger,
  isServerThread,
  selectedInstanceId,
  environmentId,
  gitCwd,
  activeThreadId,
  pullRequestProjectId,
  pullRequestRepository,
  threadPullRequests,
  planModeUiEnabled,
  compactSlashCommandAvailable,
  selectedProvider,
  selectedProviderSkills,
  selectedProviderSlashCommands,
  showSkillsInSlashMenu,
}: {
  readonly composerTrigger: ComposerTrigger | null;
  readonly isServerThread: boolean;
  readonly selectedInstanceId: ProviderInstanceId;
  readonly environmentId: EnvironmentId;
  readonly gitCwd: string | null;
  readonly activeThreadId: ThreadId | null;
  readonly pullRequestProjectId: ProjectId | null;
  readonly pullRequestRepository: string | null;
  readonly threadPullRequests: ReadonlyArray<ThreadPullRequestLink> | undefined;
  readonly planModeUiEnabled: boolean;
  readonly compactSlashCommandAvailable: boolean;
  readonly selectedProvider: ProviderDriverKind;
  readonly selectedProviderSkills: ServerProvider["skills"];
  readonly selectedProviderSlashCommands: ServerProvider["slashCommands"];
  readonly showSkillsInSlashMenu: boolean;
}) {
  // Thread mentions rank by recency as of when the composer mounted.
  const [now] = useState(() => Date.now());
  const composerTriggerKind = composerTrigger?.kind ?? null;
  const pathTriggerQuery = composerTrigger?.kind === "path" ? composerTrigger.query : "";
  const pullRequestTriggerQuery =
    composerTrigger?.kind === "pull-request" ? composerTrigger.query : "";
  const pullRequestTextQuery =
    composerTriggerKind === "pull-request" &&
    pullRequestTriggerQuery.length > 0 &&
    !/^\d+$/u.test(pullRequestTriggerQuery)
      ? pullRequestTriggerQuery
      : null;
  const debouncedPullRequestTextQuery = useDebouncedValue(pullRequestTextQuery, 180);
  const settledPullRequestTextQuery =
    pullRequestTextQuery === debouncedPullRequestTextQuery ? pullRequestTextQuery : null;
  const isPathTrigger = composerTriggerKind === "path";
  const agents = useAgents();
  const taskSuggestions = useEnvironmentQuery(
    isPathTrigger && isServerThread
      ? serverEnvironment.tasksLive({ environmentId, input: {} })
      : null,
  );
  const pageSuggestions = useEnvironmentQuery(
    isPathTrigger && isServerThread
      ? serverEnvironment.pagesLive({ environmentId, input: {} })
      : null,
  );
  const scheduledSuggestions = useEnvironmentQuery(
    isPathTrigger && isServerThread
      ? serverEnvironment.scheduledTasksLive({ environmentId, input: {} })
      : null,
  );
  const projectSuggestions = useRegularProjects(false);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  // oxlint-disable-next-line elysia/react-effect-budget -- Native skills can change outside the app; opening their menu refreshes the provider inventory.
  useEffect(() => {
    if (composerTriggerKind !== "skill" || !gitCwd) return;
    void refreshProviders({
      environmentId,
      input: { instanceId: selectedInstanceId, cwd: gitCwd, fresh: true },
    });
  }, [composerTriggerKind, environmentId, gitCwd, refreshProviders, selectedInstanceId]);
  const environmentThreadShells = useThreadShells(isPathTrigger);
  // Mounts older settled threads matching the mention, which shells may leave out.
  useThreadSearch(isPathTrigger ? [environmentId] : [], pathTriggerQuery, { titlesOnly: true });
  const workspaceEntries = useComposerPathSearch({
    environmentId,
    cwd: isPathTrigger ? gitCwd : null,
    query: isPathTrigger ? pathTriggerQuery : null,
  });

  const pullRequestListTargets =
    !(composerTriggerKind === "pull-request" || (isPathTrigger && isServerThread)) ||
    (!isPathTrigger && pullRequestProjectId === null) ||
    (pullRequestTextQuery !== null && settledPullRequestTextQuery === null)
      ? EMPTY_PULL_REQUEST_LIST_TARGETS
      : [
          {
            environmentId,
            input: {
              state: "all" as const,
              ...(isPathTrigger ? {} : { projectId: pullRequestProjectId! }),
              limit: COMPOSER_PULL_REQUEST_LIST_LIMIT,
              ...(settledPullRequestTextQuery === null
                ? {}
                : { query: settledPullRequestTextQuery }),
            },
          },
        ];
  const pullRequestLookup = usePullRequestList(pullRequestListTargets);
  const pullRequestTriggerNumber = (() => {
    if (composerTrigger?.kind !== "pull-request" || composerTrigger.query.length === 0) {
      return null;
    }
    const number = Number(composerTrigger.query);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  })();
  const debouncedPullRequestNumber = useDebouncedValue(pullRequestTriggerNumber, 180);
  const settledPullRequestNumber =
    pullRequestTriggerNumber === debouncedPullRequestNumber ? pullRequestTriggerNumber : null;
  const recentHasExactPullRequest =
    settledPullRequestNumber !== null &&
    pullRequestLookup.data?.entries.some(
      (entry) =>
        entry.projectId === pullRequestProjectId &&
        entry.repository.trim().toLowerCase() === pullRequestRepository?.trim().toLowerCase() &&
        entry.number === settledPullRequestNumber,
    ) === true;
  const exactPullRequestLookup = useEnvironmentQuery(
    settledPullRequestNumber === null ||
      pullRequestProjectId === null ||
      pullRequestRepository === null ||
      recentHasExactPullRequest
      ? null
      : pullRequestEnvironment.detail({
          environmentId,
          input: {
            projectId: pullRequestProjectId,
            repository: pullRequestRepository,
            number: settledPullRequestNumber,
          },
        }),
  );

  const linkedPullRequests =
    pullRequestProjectId === null
      ? []
      : composerPullRequestsFromLinks(threadPullRequests ?? [], pullRequestProjectId);

  const items = ((): ComposerCommandItem[] => {
    if (!composerTrigger) return [];
    if (composerTrigger.kind === "path") {
      const query = composerTrigger.query.trim().toLowerCase();
      const sourceGroup = agents.find(
        ({ project, thread }) =>
          project.environmentId === environmentId && thread?.id === activeThreadId,
      )?.project.agentProfile?.group;
      const agentItems = isServerThread
        ? agents
            .filter(
              ({ project, thread }) =>
                project.environmentId === environmentId &&
                !project.agentProfile?.archived &&
                (!sourceGroup || sourceGroup.memberProjectIds.includes(project.id)) &&
                thread &&
                thread.id !== activeThreadId &&
                project.title.toLowerCase().includes(query),
            )
            .map(({ project, busy }) => ({
              id: `agent:${project.id}`,
              type: "agent" as const,
              projectId: project.id,
              avatar: project.agentProfile!.avatar,
              isGroup: Boolean(project.agentProfile!.group),
              label: project.title,
              description: sourceGroup
                ? "Ask this agent"
                : busy
                  ? "Working. Try again when finished"
                  : project.agentProfile!.group
                    ? "Send a task to this channel"
                    : "Delegate a task to this agent",
            }))
        : [];
      return [
        ...agentItems,
        ...(isServerThread ? projectSuggestions : [])
          .filter(
            (project) =>
              project.environmentId === environmentId &&
              project.title.toLowerCase().includes(query),
          )
          .slice(0, 20)
          .map((project) => ({
            id: `project:${project.id}`,
            type: "project" as const,
            projectId: project.id,
            label: project.title,
            description: "Use this project as context",
          })),
        ...(scheduledSuggestions.data?.tasks ?? [])
          .filter((task) => task.title.toLowerCase().includes(query))
          .slice(0, 20)
          .map((task) => ({
            id: `scheduled:${task.id}`,
            type: "scheduled" as const,
            scheduledTaskId: task.id,
            label: task.title,
            description: "Use this scheduled task as context",
          })),
        ...(pullRequestLookup.data?.entries ?? [])
          .filter((entry) => matchesPullRequestQuery(entry, query))
          .slice(0, COMPOSER_PULL_REQUEST_RESULT_LIMIT)
          .map((entry) => ({
            id: `pull-request:${entry.projectId}:${entry.repository}:${entry.number}`,
            type: "pull-request" as const,
            pullRequest: {
              number: entry.number,
              title: entry.title,
              url: entry.url,
              headBranch: entry.headBranch,
              baseBranch: entry.baseBranch,
              state: entry.state,
              isDraft: entry.isDraft,
            },
            label: `#${entry.number}`,
            description: entry.title,
          })),
        ...(taskSuggestions.data?.tasks ?? [])
          .filter((task) => task.title.toLowerCase().includes(query))
          .slice(0, 20)
          .map((task) => ({
            id: `task:${task.id}`,
            type: "task" as const,
            taskId: task.id,
            label: task.title,
            description: "Use this task as context",
          })),
        ...(pageSuggestions.data?.pages ?? [])
          .filter((page) => page.title.toLowerCase().includes(query))
          .slice(0, 20)
          .map((page) => ({
            id: `page:${page.id}`,
            type: "page" as const,
            pageId: page.id,
            label: page.title,
            description: "Use this page as context",
          })),
        ...matchComposerThreadItems({
          shells: environmentThreadShells,
          environmentId,
          excludeThreadId: activeThreadId,
          query: composerTrigger.query,
          now,
        }),
        ...workspaceEntries.entries.map((entry) => ({
          id: `path:${entry.kind}:${entry.path}`,
          type: "path" as const,
          path: entry.path,
          pathKind: entry.kind,
          searchTarget: workspaceEntries.searchedTarget,
          label: basenameOfPath(entry.path),
          description: entry.path.slice(0, Math.max(0, entry.path.lastIndexOf("/"))),
        })),
      ];
    }
    if (composerTrigger.kind === "slash-command") {
      const builtInSlashCommandItems = [
        {
          id: "slash:model",
          type: "slash-command",
          command: "model",
          label: "/model",
          description: "Switch response model for this thread",
        },
        ...(planModeUiEnabled
          ? ([
              {
                id: "slash:plan",
                type: "slash-command",
                command: "plan",
                label: "/plan",
                description: "Switch this thread into plan mode",
              },
              {
                id: "slash:default",
                type: "slash-command",
                command: "default",
                label: "/default",
                description: "Switch this thread back to normal build mode",
              },
            ] as const)
          : []),
      ] satisfies ReadonlyArray<Extract<ComposerCommandItem, { type: "slash-command" }>>;
      const slashMenuSkills = getProviderSkillsForSlashMenu(
        selectedProviderSkills,
        showSkillsInSlashMenu,
      );
      const providerSlashCommandItems = getProviderSlashCommandsForSlashMenu(
        selectedProviderSlashCommands,
        slashMenuSkills,
      ).map((command) => ({
        id: `provider-slash-command:${selectedProvider}:${command.name}`,
        type: "provider-slash-command" as const,
        provider: selectedProvider,
        command,
        label: `/${command.name}`,
        description: command.description ?? command.input?.hint ?? "Run provider command",
      }));
      const query = composerTrigger.query.trim().toLowerCase();
      const skillItems = slashMenuSkills.map((skill) => ({
        id: `skill:${selectedProvider}:${skill.name}`,
        type: "skill" as const,
        provider: selectedProvider,
        skill,
        label: `/skill:${skill.name}`,
        description:
          skill.shortDescription ??
          skill.description ??
          (skill.scope ? `${skill.scope} skill` : ""),
      }));
      const visibleProviderSlashCommandItems = providerSlashCommandItems.filter(
        (item) => item.command.name !== "compact" || compactSlashCommandAvailable,
      );
      const slashCommandItems = slashCommandItemsForPromptPosition(
        [...builtInSlashCommandItems, ...visibleProviderSlashCommandItems, ...skillItems],
        composerTrigger.rangeStart === 0,
      );
      return searchSlashCommandItems(slashCommandItems, query);
    }
    if (composerTrigger.kind === "skill") {
      return searchProviderSkills(selectedProviderSkills, composerTrigger.query).map((skill) => ({
        id: `skill:${selectedProvider}:${skill.name}`,
        type: "skill" as const,
        provider: selectedProvider,
        skill,
        label: formatProviderSkillDisplayName(skill),
        description:
          skill.shortDescription ??
          skill.description ??
          (skill.scope ? `${skill.scope} skill` : "Run provider skill"),
      }));
    }
    if (
      composerTrigger.kind === "pull-request" &&
      pullRequestProjectId !== null &&
      pullRequestRepository !== null
    ) {
      const exactPullRequest =
        exactPullRequestLookup.data?.number === pullRequestTriggerNumber
          ? [exactPullRequestLookup.data]
          : [];
      const matches = /^\d*$/u.test(composerTrigger.query)
        ? filterComposerPullRequestMatches({
            entries: [...exactPullRequest, ...(pullRequestLookup.data?.entries ?? [])],
            linked: linkedPullRequests,
            projectId: pullRequestProjectId,
            repository: pullRequestRepository,
            query: composerTrigger.query,
            limit: COMPOSER_PULL_REQUEST_RESULT_LIMIT,
          })
        : rankPullRequestMatches(
            (pullRequestLookup.data?.entries ?? []).filter((entry) => {
              if (
                entry.projectId !== pullRequestProjectId ||
                entry.repository.trim().toLowerCase() !== pullRequestRepository.trim().toLowerCase()
              ) {
                return false;
              }
              const provider = pullRequestLookup.data?.providers.find(
                (candidate) => candidate.host === entry.host,
              );
              return (
                provider?.searchesOnHost === true ||
                matchesPullRequestQuery(entry, composerTrigger.query)
              );
            }),
            composerTrigger.query,
          ).slice(0, COMPOSER_PULL_REQUEST_RESULT_LIMIT);
      return matches.map((pullRequest) => ({
        id: `pull-request:${pullRequest.projectId}:${pullRequest.repository}:${pullRequest.number}`,
        type: "pull-request",
        pullRequest: {
          number: pullRequest.number,
          title: pullRequest.title,
          url: pullRequest.url,
          headBranch: pullRequest.headBranch,
          baseBranch: pullRequest.baseBranch,
          state: pullRequest.state,
          isDraft: pullRequest.isDraft,
        },
        label: `#${pullRequest.number}`,
        description:
          pullRequest.repository.trim().toLowerCase() === pullRequestRepository.trim().toLowerCase()
            ? pullRequest.title
            : `${pullRequest.repository} · ${pullRequest.title}`,
      }));
    }
    return [];
  })();
  const isLoading =
    (isPathTrigger &&
      (taskSuggestions.isPending ||
        pageSuggestions.isPending ||
        scheduledSuggestions.isPending ||
        pullRequestLookup.isPending ||
        (pathTriggerQuery.length > 0 && workspaceEntries.isPending))) ||
    (composerTriggerKind === "pull-request" &&
      pullRequestProjectId !== null &&
      pullRequestRepository !== null &&
      (pullRequestLookup.isPending ||
        pullRequestTextQuery !== debouncedPullRequestTextQuery ||
        pullRequestTriggerNumber !== debouncedPullRequestNumber ||
        exactPullRequestLookup.isPending));
  const emptyState = (() => {
    if (composerTriggerKind === "skill") {
      return "No skills found. Try / to browse provider commands.";
    }
    if (composerTriggerKind === "pull-request") {
      if (pullRequestProjectId === null || pullRequestRepository === null) {
        return "Pull requests are not available for this project.";
      }
      if (
        pullRequestLookup.error !== null ||
        pullRequestLookup.data?.errors.some((error) => error.projectId === pullRequestProjectId)
      ) {
        return "Pull requests could not be read for this project.";
      }
      return composerTrigger?.query
        ? `No pull request matches ${composerTrigger.query}.`
        : "No pull requests found in this repository.";
    }
    return composerTriggerKind === "path"
      ? "No matching agents, projects, tasks, scheduled tasks, pages, pull requests, threads, files or folders."
      : "No matching command.";
  })();

  return { items, isLoading, emptyState };
}

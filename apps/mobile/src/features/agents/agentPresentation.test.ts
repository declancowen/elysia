import {
  scopeProject,
  scopeThreadShell,
  type EnvironmentProject,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type AgentProfile,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  selectAgentRoster,
  selectNonAgentProjectItems,
  selectRegularProjects,
} from "./agentPresentation";

const local = EnvironmentId.make("local");
const remote = EnvironmentId.make("remote");
const profile: AgentProfile = {
  instructions: "Help with work.",
  title: "Research assistant",
  avatar: { preset: "brain", color: "blue" },
  notificationsEnabled: true,
  archived: false,
};

function project(
  id: string,
  agentProfile?: AgentProfile,
  environmentId = local,
): EnvironmentProject {
  return scopeProject(environmentId, {
    id: ProjectId.make(id),
    title: id,
    workspaceRoot: `/workspaces/${id}`,
    repositoryIdentity: null,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...(agentProfile ? { agentProfile } : {}),
  });
}

function thread(
  id: string,
  owner: EnvironmentProject,
  extra: Partial<EnvironmentThreadShell> = {},
): EnvironmentThreadShell {
  return scopeThreadShell(owner.environmentId, {
    id: ThreadId.make(id),
    projectId: owner.id,
    title: id,
    modelSelection: {
      instanceId: ProviderInstanceId.make("claudeAgent"),
      model: "claude-sonnet-5",
    },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    pullRequests: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    archivedAt: null,
    settledAt: null,
    settledOverride: null,
    session: null,
    latestUserMessageAt: null,
    latestTurn: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    ...extra,
  });
}

describe("mobile agent presentation", () => {
  it("keeps all agent backing projects out of generic project choices, including archived profiles", () => {
    const ordinary = project("work");
    const activeAgent = project("agent", profile);
    const archivedAgent = project("archived-agent", { ...profile, archived: true });
    const projects = [ordinary, activeAgent, archivedAgent];

    expect(selectRegularProjects(projects)).toEqual([ordinary]);
    expect(projects).toEqual([ordinary, activeAgent, archivedAgent]);
  });

  it("filters Recents, search and pending-task navigation using environment-scoped project identity", () => {
    const agent = project("shared", profile);
    const ordinary = project("shared", undefined, remote);
    const agentThread = thread("agent-chat", agent);
    const ordinaryThread = thread("work-chat", ordinary);
    const allThreads = [agentThread, ordinaryThread];
    const pending = [
      { environmentId: local, projectId: agent.id, draftId: "agent-draft" },
      { environmentId: remote, projectId: ordinary.id, draftId: "work-draft" },
    ];

    expect(selectNonAgentProjectItems(allThreads, [agent, ordinary])).toEqual([ordinaryThread]);
    expect(selectNonAgentProjectItems(pending, [agent, ordinary])).toEqual([pending[1]]);
    expect(allThreads).toEqual([agentThread, ordinaryThread]);
    expect(allThreads[0]?.modelSelection.model).toBe("claude-sonnet-5");
  });

  it("opens the saved native conversation and excludes archived profiles from the roster", () => {
    const agent = project("agent", { ...profile, conversationThreadId: ThreadId.make("saved") });
    const archived = project("archived", { ...profile, archived: true });
    const older = thread("older", agent);
    const saved = thread("saved", agent, { createdAt: "2026-10-02T00:00:00.000Z" });
    const threads = [older, saved, thread("archived-profile-chat", archived)];

    const roster = selectAgentRoster([agent, archived, project("ordinary")], threads);

    expect(roster).toHaveLength(1);
    expect(roster[0]?.project.agentProfile).toEqual(agent.agentProfile);
    expect(roster[0]?.conversation).toBe(saved);
    expect(threads).toHaveLength(3);
  });

  it("uses a deterministic earliest active conversation when the saved chat is missing or archived", () => {
    const agent = project("shared", { ...profile, conversationThreadId: ThreadId.make("old") });
    const otherEnvironmentAgent = project("shared", profile, remote);
    const later = thread("later", agent, { createdAt: "2026-10-03T00:00:00.000Z" });
    const earliestB = thread("b", agent);
    const earliestA = thread("a", agent);
    const old = thread("old", agent, { archivedAt: "2026-10-02T00:00:00.000Z" });
    const wrongEnvironment = thread("saved", otherEnvironmentAgent, {
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    const threads = [later, earliestB, old, wrongEnvironment, earliestA];

    expect(selectAgentRoster([agent], threads)[0]?.conversation).toBe(earliestA);
    expect(
      selectAgentRoster([agent], [earliestA, wrongEnvironment, old, earliestB, later])[0]
        ?.conversation,
    ).toBe(earliestA);
    expect(threads).toEqual([later, earliestB, old, wrongEnvironment, earliestA]);
  });

  it("keeps a profile visible while its native conversation is not yet available", () => {
    const agent = project("agent", profile);

    expect(selectAgentRoster([agent], [])).toEqual([{ project: agent, conversation: null }]);
  });
});

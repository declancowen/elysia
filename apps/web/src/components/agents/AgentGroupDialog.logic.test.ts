import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type AgentProfile,
} from "@elysiatools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  agentGroupCandidates,
  makeAgentGroupProfile,
  resolveAgentGroupSelection,
} from "./AgentGroupDialog.logic";
import type { AgentRosterEntry } from "./useAgents";

const local = EnvironmentId.make("local");
const remote = EnvironmentId.make("remote");
const profile: AgentProfile = {
  title: "Researcher",
  instructions: "Research the request.",
  avatar: { preset: "circle", color: "#28B4FF" },
  notificationsEnabled: true,
  archived: false,
};
function agent(
  id: string,
  environmentId = local,
  overrides: Partial<AgentProfile> = {},
): AgentRosterEntry {
  return {
    project: {
      id: ProjectId.make(id),
      environmentId,
      title: id,
      workspaceRoot: `/agents/${id}`,
      repositoryIdentity: null,
      defaultModelSelection: { instanceId: ProviderInstanceId.make("elysia"), model: "native" },
      scripts: [],
      createdAt: "2026-10-03T12:00:00.000Z",
      updatedAt: "2026-10-03T12:00:00.000Z",
      agentProfile: { ...profile, ...overrides },
    },
    thread: null,
    busy: false,
  };
}
const alice = agent("alice");
const bob = agent("bob");
const ids = [alice.project.id, bob.project.id];

describe("agent group setup", () => {
  it("only offers active individual agents in the target environment", () => {
    const candidates = agentGroupCandidates(
      [
        alice,
        bob,
        agent("other", remote),
        agent("archived", local, { archived: true }),
        agent("group", local, {
          group: { memberProjectIds: ids, leadProjectId: alice.project.id },
        }),
      ],
      local,
    );
    expect(candidates.map(({ project }) => project.id)).toEqual(ids);
    expect(agentGroupCandidates([alice], null)).toEqual([]);
  });

  it("requires a name, distinct members and a lead belonging to the selection", () => {
    const agents = [alice, bob];
    expect(resolveAgentGroupSelection(" ", agents, ids, alice.project.id)).toBeNull();
    expect(
      resolveAgentGroupSelection("Team", agents, [alice.project.id], alice.project.id),
    ).toBeNull();
    expect(
      resolveAgentGroupSelection(
        "Team",
        agents,
        [alice.project.id, alice.project.id],
        alice.project.id,
      ),
    ).toBeNull();
    expect(resolveAgentGroupSelection("Team", agents, ids, ProjectId.make("missing"))).toBeNull();
    expect(resolveAgentGroupSelection("Team", agents, ids, null)).toBeNull();
    expect(resolveAgentGroupSelection(" Team ", agents, ids, bob.project.id)?.lead).toBe(bob);
  });

  it("rejects unavailable, archived, nested or cross-environment members", () => {
    expect(resolveAgentGroupSelection("Team", [alice], ids, alice.project.id)).toBeNull();
    expect(
      resolveAgentGroupSelection("Team", [alice, agent("bob", remote)], ids, alice.project.id),
    ).toBeNull();
    expect(
      resolveAgentGroupSelection(
        "Team",
        [alice, agent("bob", local, { archived: true })],
        ids,
        alice.project.id,
      ),
    ).toBeNull();
    expect(
      resolveAgentGroupSelection(
        "Team",
        [
          alice,
          agent("bob", local, {
            group: { memberProjectIds: ids, leadProjectId: alice.project.id },
          }),
        ],
        ids,
        alice.project.id,
      ),
    ).toBeNull();
    const many = Array.from({ length: 33 }, (_, index) => agent(String(index)));
    expect(
      resolveAgentGroupSelection(
        "Team",
        many,
        many.map(({ project }) => project.id),
        many[0]!.project.id,
      ),
    ).toBeNull();
  });

  it("creates lead-based defaults and preserves existing profile and conversation when edited", () => {
    const fresh = makeAgentGroupProfile(alice, ids);
    expect(fresh.group).toEqual({ memberProjectIds: ids, leadProjectId: alice.project.id });
    expect(fresh.avatar).toEqual(profile.avatar);
    const existing = {
      ...profile,
      instructions: "Keep custom instructions",
      conversationThreadId: ThreadId.make("durable-chat"),
      notificationsEnabled: false,
    };
    const edited = makeAgentGroupProfile(bob, ids, existing);
    expect(edited).toEqual({
      ...existing,
      group: { memberProjectIds: ids, leadProjectId: bob.project.id },
    });
  });
});

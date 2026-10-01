import { EnvironmentId, ProjectId, ThreadId, type AgentProfile } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  getAgentConversation,
  selectNonAgentProjectItems,
  selectRegularProjects,
} from "./agentPresentation";

const environmentId = EnvironmentId.make("local");
const otherEnvironmentId = EnvironmentId.make("other");
const projectId = ProjectId.make("shared-id");
const profile: AgentProfile = {
  instructions: "Help with research.",
  avatar: { preset: "brain", color: "violet" },
  notificationsEnabled: true,
  archived: false,
  conversationThreadId: ThreadId.make("persistent-conversation"),
};
const agent = { environmentId, id: projectId, agentProfile: profile };

describe("agent presentation", () => {
  it("hides active and archived agent projects without changing raw entities", () => {
    const regular = { environmentId: otherEnvironmentId, id: projectId, agentProfile: undefined };
    const archived = {
      ...agent,
      id: ProjectId.make("archived-agent"),
      agentProfile: { ...profile, archived: true },
    };
    const projects = [agent, regular, archived];
    expect(selectRegularProjects(projects)).toEqual([regular]);
    expect(projects).toEqual([agent, regular, archived]);
  });

  it("keeps threads, drafts, and search results from other environments with the same project ID", () => {
    const agentItem = { environmentId, projectId, text: "agent conversation" };
    const ordinaryItem = {
      environmentId: otherEnvironmentId,
      projectId,
      text: "ordinary conversation",
    };
    const unknownProjectItem = {
      environmentId,
      projectId: ProjectId.make("not-yet-synced"),
      text: "new project",
    };
    const items = [agentItem, ordinaryItem, unknownProjectItem];
    expect(selectNonAgentProjectItems(items, [agent])).toEqual([ordinaryItem, unknownProjectItem]);
    expect(items).toHaveLength(3);
  });

  it("opens the saved conversation even when generic thread actions archived it", () => {
    const saved = {
      environmentId,
      projectId,
      id: profile.conversationThreadId!,
      archivedAt: "2026-10-01T10:00:00Z",
      createdAt: "2026-10-01T09:00:00Z",
    };
    const newer = {
      ...saved,
      id: ThreadId.make("newer"),
      archivedAt: null,
      createdAt: "2026-10-01T09:30:00Z",
    };
    const other = { ...saved, environmentId: otherEnvironmentId, archivedAt: null };
    expect(getAgentConversation(agent, [other, newer, saved])).toBe(saved);
  });

  it("uses the oldest visible conversation as the compatibility fallback", () => {
    const old = {
      environmentId,
      projectId,
      id: ThreadId.make("old"),
      archivedAt: null,
      createdAt: "2026-10-01T09:00:00Z",
    };
    const archived = {
      ...old,
      id: ThreadId.make("archived"),
      createdAt: "2026-10-01T08:00:00Z",
      archivedAt: "2026-10-01T10:00:00Z",
    };
    const newThread = { ...old, id: ThreadId.make("new"), createdAt: "2026-10-01T09:30:00Z" };
    expect(getAgentConversation(agent, [newThread, archived, old])).toBe(old);
    const legacy = { ...agent, agentProfile: { ...profile, conversationThreadId: undefined } };
    expect(
      getAgentConversation(legacy, [
        archived,
        { ...newThread, archivedAt: "2026-10-01T10:00:00Z" },
      ]),
    ).toBe(archived);
    expect(getAgentConversation(agent, [])).toBeNull();
  });
});

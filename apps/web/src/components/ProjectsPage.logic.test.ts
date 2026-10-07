import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildSidebarProjectSnapshots } from "../sidebarProjectGrouping";
import { makeThreadFixture } from "../test-fixtures";
import type { Project } from "../types";
import { buildProjectsPageRows, projectThreadUpdatedAt } from "./ProjectsPage.logic";

const local = EnvironmentId.make("local");
const remote = EnvironmentId.make("remote");
const project = (id: string, environmentId = local, overrides: Partial<Project> = {}): Project => ({
  id: ProjectId.make(id),
  environmentId,
  title: id,
  workspaceRoot: `/projects/${id}`,
  repositoryIdentity: null,
  defaultModelSelection: { instanceId: ProviderInstanceId.make("elysia"), model: "native" },
  scripts: [],
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z",
  ...overrides,
});
const groups = (projects: Project[]) =>
  buildSidebarProjectSnapshots({
    projects,
    settings: { sidebarProjectGroupingMode: "separate", sidebarProjectGroupingOverrides: {} },
    primaryEnvironmentId: local,
    resolveEnvironmentLabel: () => null,
  });
const scratchRoot = () => "/projects/scratch";

describe("Projects page rows", () => {
  it("excludes agent workspaces and scratch projects while searching titles and paths", () => {
    const projects = groups([
      project("Website", local, { workspaceRoot: "/work/elysia" }),
      project("scratch"),
      project("Agent", local, {
        agentProfile: {
          title: "Agent",
          instructions: "Help",
          avatar: { preset: "square", color: "#28B4FF" },
          archived: false,
          notificationsEnabled: true,
        },
      }),
    ]);
    expect(
      buildProjectsPageRows(projects, [], "", scratchRoot).map(
        ({ project }) => project.displayName,
      ),
    ).toEqual(["Website"]);
    expect(
      buildProjectsPageRows(projects, [], " ELYSIA ", scratchRoot).map(
        ({ project }) => project.displayName,
      ),
    ).toEqual(["Website"]);
    expect(buildProjectsPageRows(projects, [], "missing", scratchRoot)).toEqual([]);
  });

  it("keeps identical IDs scoped to each environment and excludes archived and subagent chats", () => {
    const projects = groups([project("same", local), project("same", remote)]);
    const regular = makeThreadFixture({
      id: ThreadId.make("same-thread"),
      projectId: ProjectId.make("same"),
      environmentId: local,
      latestUserMessageAt: "2026-10-02T12:00:00.000Z",
    });
    const other = makeThreadFixture({
      ...regular,
      environmentId: remote,
      latestUserMessageAt: "2026-10-03T12:00:00.000Z",
    });
    const archived = makeThreadFixture({
      ...regular,
      id: ThreadId.make("archived"),
      archivedAt: "2026-10-03T12:00:00.000Z",
    });
    const child = makeThreadFixture({
      ...regular,
      id: ThreadId.make("child"),
      lineage: {
        rootThreadId: regular.id,
        parentThreadId: regular.id,
        relationshipToParent: "subagent",
      },
    });
    const rows = buildProjectsPageRows(
      projects,
      [regular, other, archived, child],
      "",
      scratchRoot,
    );
    expect(rows.map(({ project }) => project.environmentId)).toEqual([remote, local]);
    expect(rows.map(({ threads }) => threads.map((thread) => thread.environmentId))).toEqual([
      [remote],
      [local],
    ]);
    expect(projectThreadUpdatedAt(other)).toBe("2026-10-03T12:00:00.000Z");
  });

  it("sorts chats by latest activity and uses project update time when empty", () => {
    const projects = groups([
      project("empty", local, { updatedAt: "2026-10-04T12:00:00.000Z" }),
      project("busy"),
    ]);
    const older = makeThreadFixture({
      id: ThreadId.make("older"),
      projectId: ProjectId.make("busy"),
      environmentId: local,
      updatedAt: "2026-10-02T12:00:00.000Z",
    });
    const newer = makeThreadFixture({
      ...older,
      id: ThreadId.make("newer"),
      updatedAt: "2026-10-03T12:00:00.000Z",
    });
    const rows = buildProjectsPageRows(projects, [older, newer], "", scratchRoot);
    expect(rows.map(({ project }) => project.displayName)).toEqual(["empty", "busy"]);
    expect(rows[1]?.threads.map((thread) => thread.id)).toEqual([newer.id, older.id]);
  });
});

describe("Projects surface manual chat order", () => {
  it("uses the persisted sidebar order while preserving project and environment ownership", () => {
    const entries = groups([project("same", local), project("same", remote)]);
    const first = makeThreadFixture({
      id: ThreadId.make("first"),
      projectId: ProjectId.make("same"),
      environmentId: local,
      updatedAt: "2026-10-01T12:00:00.000Z",
    });
    const newer = makeThreadFixture({
      ...first,
      id: ThreadId.make("newer"),
      updatedAt: "2026-10-03T12:00:00.000Z",
    });
    const other = makeThreadFixture({ ...newer, environmentId: remote });
    const rows = buildProjectsPageRows(entries, [first, newer, other], "", scratchRoot, [
      scopedThreadKey(scopeThreadRef(local, first.id)),
    ]);
    expect(
      rows
        .find((entry) => entry.project.environmentId === local)
        ?.threads.map((thread) => thread.id),
    ).toEqual([first.id, newer.id]);
    expect(rows.find((entry) => entry.project.environmentId === remote)?.threads).toEqual([other]);
  });
});

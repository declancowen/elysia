import { describe, expect, it } from "vite-plus/test";
import { PageId, ProjectId, type PageSummary } from "@t3tools/contracts";
import { groupPages } from "./PagesPage.logic";
const projectId = ProjectId.make("project-a");
const row = (title: string, project: ProjectId | null, time: string): PageSummary => ({
  id: PageId.make("page-00000000-0000-0000-0000-000000000001"),
  title,
  projectId: project,
  createdAt: time,
  updatedAt: time,
  revision: 1,
});
describe("page grouping", () => {
  it("sorts matching pages, grouping missing project links into No project", () => {
    const pages = [
      row("Zulu", null, "2026-10-01T00:00:00.000Z"),
      row("Alpha", projectId, "2026-10-02T00:00:00.000Z"),
      row("Beta", ProjectId.make("deleted-project"), "2026-10-03T00:00:00.000Z"),
    ];
    const projects = [{ id: projectId, title: "Product" }];
    const groups = groupPages(pages, projects, { search: "", groupByProject: true, sort: "title" });
    expect(groups.map((group) => group.title)).toEqual(["Product", "No project"]);
    expect(groups[1]?.pages.map((page) => page.title)).toEqual(["Beta", "Zulu"]);
    expect(
      groupPages(pages, projects, {
        search: " AL ",
        groupByProject: false,
        sort: "updated",
      })[0]?.pages.map((page) => page.title),
    ).toEqual(["Alpha"]);
    expect(
      groupPages(pages, projects, {
        search: "",
        groupByProject: false,
        sort: "updated",
      })[0]?.pages.map((page) => page.title),
    ).toEqual(["Beta", "Alpha", "Zulu"]);
  });
  it("hides empty projects and orders project groups independently of their pages", () => {
    const projects = [
      { id: projectId, title: "Product" },
      { id: ProjectId.make("project-b"), title: "Research" },
    ];
    const pages = [row("Notes", projectId, "2026-10-01T00:00:00.000Z")];
    expect(
      groupPages(pages, projects, {
        search: "",
        groupByProject: true,
        sort: "updated",
        hideEmpty: true,
      }).map((group) => group.title),
    ).toEqual(["Product"]);
    expect(
      groupPages(pages, projects, {
        search: "",
        groupByProject: true,
        sort: "updated",
        hideEmpty: false,
        groupDescending: true,
      }).map((group) => group.title),
    ).toEqual(["Research", "Product", "No project"]);
  });
  it("keeps orphaned pages in No project and preserves linked projects", () => {
    const projects = [
      { id: projectId, title: "Product" },
      { id: ProjectId.make("project-b"), title: "Research" },
    ];
    const pages = [
      row("Linked", projectId, "2026-10-01T00:00:00.000Z"),
      row("Orphan", ProjectId.make("removed"), "2026-10-02T00:00:00.000Z"),
      row("Unlinked", null, "2026-10-03T00:00:00.000Z"),
    ];
    const groups = groupPages(pages, projects, {
      search: "",
      groupByProject: true,
      sort: "title",
      hideEmpty: false,
    });
    expect(groups.map((group) => group.title)).toEqual(["Product", "Research", "No project"]);
    expect(groups[0]?.pages.map((page) => page.title)).toEqual(["Linked"]);
    expect(groups[2]?.pages.map((page) => page.title)).toEqual(["Orphan", "Unlinked"]);
  });
});

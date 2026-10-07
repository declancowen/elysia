import { describe, expect, it } from "vite-plus/test";
import { PageId, ProjectId, type PageSummary } from "@t3tools/contracts";
import {
  readPageDragIds,
  groupPages,
  pageTreeRows,
  pageSelectionRoots,
  pageMoveDestinations,
  pageFolderGrouping,
} from "./PagesPage.logic";
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
  it("sorts matching pages, grouping missing project links into No Project", () => {
    const pages = [
      row("Zulu", null, "2026-10-01T00:00:00.000Z"),
      row("Alpha", projectId, "2026-10-02T00:00:00.000Z"),
      row("Beta", ProjectId.make("deleted-project"), "2026-10-03T00:00:00.000Z"),
    ];
    const projects = [{ id: projectId, title: "Product" }];
    const groups = groupPages(pages, projects, { search: "", groupByProject: true, sort: "title" });
    expect(groups.map((group) => group.title)).toEqual(["Product", "No Project"]);
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
    ).toEqual(["Research", "Product", "No Project"]);
  });
  it("keeps orphaned pages in No Project and preserves linked projects", () => {
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
    expect(groups.map((group) => group.title)).toEqual(["Product", "Research", "No Project"]);
    expect(groups[0]?.pages.map((page) => page.title)).toEqual(["Linked"]);
    expect(groups[2]?.pages.map((page) => page.title)).toEqual(["Orphan", "Unlinked"]);
  });
});

it("shows unfiled pages before folders and expands descendants only in requested list rows", () => {
  const time = "2026-10-07T00:00:00.000Z";
  const root = {
    ...row("Folder", projectId, time),
    id: PageId.make("page-00000000-0000-0000-0000-000000000010"),
    kind: "folder" as const,
  };
  const nested = {
    ...row("Nested", projectId, time),
    id: PageId.make("page-00000000-0000-0000-0000-000000000011"),
    kind: "folder" as const,
    parentFolderId: root.id,
  };
  const child = {
    ...row("Child", projectId, time),
    id: PageId.make("page-00000000-0000-0000-0000-000000000012"),
    parentFolderId: nested.id,
  };
  const unfiled = {
    ...row("Unfiled", projectId, time),
    id: PageId.make("page-00000000-0000-0000-0000-000000000013"),
  };
  const roots = groupPages([root, unfiled], [], {
    search: "",
    groupByProject: false,
    sort: "title",
  })[0]!.pages;
  expect(roots.map((page) => page.title)).toEqual(["Unfiled", "Folder"]);
  expect(
    pageTreeRows(roots, [root, nested, child, unfiled], new Set(), "title").map(
      ({ page }) => page.title,
    ),
  ).toEqual(["Unfiled", "Folder"]);
  expect(
    pageTreeRows(roots, [root, nested, child, unfiled], new Set([root.id, nested.id]), "title").map(
      ({ page, depth }) => [page.title, depth],
    ),
  ).toEqual([
    ["Unfiled", 0],
    ["Folder", 0],
    ["Nested", 1],
    ["Child", 2],
  ]);
});

it("operates selected folder subtrees only once and keeps independent selections", () => {
  const folder = {
    ...row("Folder", null, "2026-10-07T00:00:00Z"),
    id: PageId.make("page-00000000-0000-0000-0000-000000000002"),
    kind: "folder" as const,
  };
  const child = {
    ...row("Child", null, folder.createdAt),
    id: PageId.make("page-00000000-0000-0000-0000-000000000003"),
    parentFolderId: folder.id,
  };
  const other = {
    ...row("Other", null, folder.createdAt),
    id: PageId.make("page-00000000-0000-0000-0000-000000000004"),
  };
  expect(
    pageSelectionRoots([folder, child, other], new Set([folder.id, child.id, other.id])).map(
      (page) => page.id,
    ),
  ).toEqual([folder.id, other.id]);
  expect(pageSelectionRoots([folder, child], new Set([child.id]))).toEqual([child]);
});

it("groups only top-level pages and folders by type", () => {
  const folder = {
    ...row("Folder", projectId, "2026-10-07T00:00:00Z"),
    id: PageId.make("page-00000000-0000-0000-0000-000000000010"),
    kind: "folder" as const,
  };
  const child = {
    ...row("Child", projectId, folder.createdAt),
    id: PageId.make("page-00000000-0000-0000-0000-000000000011"),
    parentFolderId: folder.id,
  };
  const page = row("Root page", null, folder.createdAt);
  const groups = groupPages([folder, child, page], [], {
    search: "",
    sort: "title",
    groupByProject: false,
    groupByType: true,
  });
  expect(groups.map((group) => [group.title, group.pages.map((page) => page.title)])).toEqual([
    ["Pages", ["Root page"]],
    ["Folders", ["Folder"]],
  ]);
  expect(
    pageTreeRows(groups[1]!.pages, [folder, child, page], new Set([folder.id]), "title").map(
      ({ page }) => page.title,
    ),
  ).toEqual(["Folder", "Child"]);
});

it("keeps Type subgroups inside each project, including the current folder level", () => {
  const folder = {
    ...row("Library", projectId, "2026-10-07"),
    id: PageId.make("page-00000000-0000-0000-0000-000000000021"),
    kind: "folder" as const,
  };
  const child = {
    ...row("Notes", projectId, "2026-10-07"),
    id: PageId.make("page-00000000-0000-0000-0000-000000000022"),
    parentFolderId: folder.id,
  };
  const loose = {
    ...row("Loose", null, "2026-10-07"),
    id: PageId.make("page-00000000-0000-0000-0000-000000000023"),
  };
  const groups = groupPages([folder, loose], [{ id: projectId, title: "Product" }], {
    search: "",
    sort: "title",
    groupByProject: true,
    subgroup: "type",
  });
  expect(groups.map((group) => [group.title, group.children.map((child) => child.title)])).toEqual([
    ["Product", ["Folders"]],
    ["No Project", ["Pages"]],
  ]);
  expect(groups[0]?.children[0]?.key).toBe("project-a/type:folder");
  expect(
    groupPages([child], [], {
      search: "",
      sort: "title",
      groupByProject: false,
      groupByType: true,
      includeNested: true,
    })[0]?.pages,
  ).toEqual([child]);
});

it("fits preview content and wrapped properties in whole compact-folder rows", async () => {
  const { pageCardGeometry } = await import("./PagesPage.logic");
  const compact = pageCardGeometry(0, false);
  const preview = pageCardGeometry(0, true);
  const properties = pageCardGeometry(3, true);
  expect(preview.pageHeight).toBeGreaterThan(compact.pageHeight);
  // At narrow widths, three pills may each need a separate line plus two gaps.
  expect(properties.folderHeight - 32).toBeGreaterThanOrEqual(20 + 12 + 3 * 22 + 2 * 8);
  expect(properties.pageHeight - 32).toBeGreaterThanOrEqual(40 + 132 + 12 + 3 * 22 + 2 * 8);
  expect(properties.pageHeight + 16).toBe(properties.pageRows * (properties.folderHeight + 16));
});

it("offers real project drop targets without treating Type groups as projects", () => {
  const pages = [row("Linked", projectId, "2026-10-07"), row("Unlinked", null, "2026-10-07")];
  const projects = [{ id: projectId, title: "Product" }];
  const grouped = groupPages(pages, projects, { search: "", sort: "title", groupByProject: true });
  expect(grouped.map((group) => group.projectId)).toEqual([projectId, null]);
  const typed = groupPages(pages, projects, {
    search: "",
    sort: "title",
    groupByProject: false,
    groupByType: true,
    subgroup: "project",
  });
  expect(typed[0]?.projectId).toBeUndefined();
  expect(typed[0]?.children.map((group) => group.projectId)).toEqual([projectId, null]);
});

it("excludes a selected folder subtree from move destinations without excluding its parent", () => {
  const at = "2026-10-07";
  const root = {
    ...row("Root", null, at),
    id: PageId.make("page-00000000-0000-0000-0000-000000000031"),
    kind: "folder" as const,
  };
  const child = {
    ...row("Child", null, at),
    id: PageId.make("page-00000000-0000-0000-0000-000000000032"),
    kind: "folder" as const,
    parentFolderId: root.id,
  };
  const safe = {
    ...row("Safe", null, at),
    id: PageId.make("page-00000000-0000-0000-0000-000000000033"),
    kind: "folder" as const,
  };
  const folders = [root, child, safe];
  expect(pageMoveDestinations(folders, new Set([root.id])).map((folder) => folder.id)).toEqual([
    safe.id,
  ]);
  expect(pageMoveDestinations(folders, new Set([child.id])).map((folder) => folder.id)).toEqual([
    root.id,
    safe.id,
  ]);
});

describe("page drag payload", () => {
  it("deduplicates known identities and rejects malformed or foreign environment payloads", () => {
    const first = row("Page", null, "2026-10-01T00:00:00.000Z");
    const second = { ...first, id: PageId.make("page-00000000-0000-0000-0000-000000000002") };
    expect(readPageDragIds(JSON.stringify([first.id, first.id]), [first, second])).toEqual([
      first.id,
    ]);
    expect(() => readPageDragIds(JSON.stringify(["page-foreign"]), [first, second])).toThrow(
      "Could not read",
    );
    expect(() =>
      readPageDragIds(JSON.stringify([first.id, first.id, first.id]), [first, second]),
    ).toThrow("Could not read");
    expect(() => readPageDragIds("{}", [first])).toThrow("Could not read");
    expect(() => readPageDragIds("[]", [first])).toThrow("Could not read");
  });
});

it("drops inherited project grouping only inside a project-linked folder", () => {
  expect(pageFolderGrouping("project", "type", projectId)).toEqual({
    grouping: "type",
    subgroup: "none",
  });
  expect(pageFolderGrouping("project", "type", null)).toEqual({
    grouping: "project",
    subgroup: "type",
  });
  expect(pageFolderGrouping("project", "type", undefined)).toEqual({
    grouping: "project",
    subgroup: "type",
  });
});

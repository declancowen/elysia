import type { PageSummary, ProjectId, PageId } from "@t3tools/contracts";
export type PageGroup = {
  key: string;
  title: string;
  pages: PageSummary[];
  children: PageGroup[];
  /** Present only for project groups; null is the No Project drop target. */
  projectId?: ProjectId | null;
};
export function groupPages(
  pages: readonly PageSummary[],
  projects: readonly { readonly id: ProjectId; readonly title: string }[],
  options: {
    readonly search: string;
    readonly groupByProject: boolean;
    readonly groupByType?: boolean;
    readonly includeNested?: boolean;
    readonly subgroup?: "project" | "type" | "none";
    readonly sort: "updated" | "created" | "title";
    readonly groupDescending?: boolean;
    readonly hideEmpty?: boolean;
  },
): PageGroup[] {
  const search = options.search.trim().toLocaleLowerCase();
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const rows = pages
    .filter((page) => page.title.toLocaleLowerCase().includes(search))
    .toSorted(
      (a, b) =>
        Number(a.kind === "folder") - Number(b.kind === "folder") ||
        (options.sort === "title"
          ? a.title.localeCompare(b.title)
          : options.sort === "created"
            ? b.createdAt.localeCompare(a.createdAt)
            : b.updatedAt.localeCompare(a.updatedAt)),
    );
  let groups: PageGroup[];
  if (options.groupByType) {
    const roots = options.includeNested ? rows : rows.filter((page) => !page.parentFolderId);
    groups = [
      {
        key: "type:page",
        title: "Pages",
        pages: roots.filter((page) => page.kind !== "folder"),
        children: [],
      },
      {
        key: "type:folder",
        title: "Folders",
        pages: roots.filter((page) => page.kind === "folder"),
        children: [],
      },
    ].filter((group) => options.hideEmpty === false || group.pages.length > 0);
  } else if (!options.groupByProject) {
    groups = [{ key: "all", title: "", pages: rows, children: [] }];
  } else {
    const byProject = new Map<string, PageGroup>();
    if (options.hideEmpty === false) {
      for (const project of projects)
        byProject.set(project.id, {
          key: project.id,
          projectId: project.id,
          title: project.title,
          pages: [],
          children: [],
        });
      byProject.set("none", {
        key: "none",
        projectId: null,
        title: "No Project",
        pages: [],
        children: [],
      });
    }
    for (const page of rows) {
      const project = page.projectId ? projectsById.get(page.projectId) : undefined;
      const key = project?.id ?? "none";
      const group = byProject.get(key) ?? {
        key,
        projectId: project?.id ?? null,
        title: project?.title ?? "No Project",
        pages: [],
        children: [],
      };
      group.pages.push(page);
      byProject.set(key, group);
    }
    groups = [...byProject.values()].toSorted((a, b) =>
      a.key === "none"
        ? 1
        : b.key === "none"
          ? -1
          : options.groupDescending
            ? b.title.localeCompare(a.title)
            : a.title.localeCompare(b.title),
    );
  }
  const subgroup = options.subgroup;
  if (
    subgroup &&
    subgroup !== "none" &&
    !(subgroup === "project" && options.groupByProject) &&
    !(subgroup === "type" && options.groupByType)
  ) {
    for (const group of groups) {
      group.children = groupPages(group.pages, projects, {
        ...options,
        search: "",
        groupByProject: subgroup === "project",
        groupByType: subgroup === "type",
        includeNested: true,
        subgroup: "none",
      }).map((child) => ({ ...child, key: `${group.key}/${child.key}` }));
    }
  }
  return groups;
}

/** Lists expand folders in place; other views render only the roots supplied by the browser. */
export function pageTreeRows(
  roots: readonly PageSummary[],
  pages: readonly PageSummary[],
  expanded: ReadonlySet<PageId>,
  sort: "updated" | "created" | "title",
) {
  const children = new Map<PageId, PageSummary[]>();
  for (const page of pages) {
    if (!page.parentFolderId) continue;
    const rows = children.get(page.parentFolderId) ?? [];
    rows.push(page);
    children.set(page.parentFolderId, rows);
  }
  const rows: { page: PageSummary; depth: number }[] = [];
  const seen = new Set<PageId>();
  const visit = (items: readonly PageSummary[], depth: number) => {
    for (const page of items) {
      if (seen.has(page.id)) continue;
      seen.add(page.id);
      rows.push({ page, depth });
      if (page.kind === "folder" && expanded.has(page.id))
        visit(
          groupPages(children.get(page.id) ?? [], [], {
            search: "",
            sort,
            groupByProject: false,
          })[0]!.pages,
          depth + 1,
        );
    }
  };
  visit(roots, 0);
  return rows;
}

export function pageSelectionRoots(pages: readonly PageSummary[], ids: ReadonlySet<PageId>) {
  const byId = new Map(pages.map((page) => [page.id, page]));
  return pages.filter((page) => {
    if (!ids.has(page.id)) return false;
    const seen = new Set<PageId>();
    for (
      let parent = page.parentFolderId;
      parent && !seen.has(parent);
      parent = byId.get(parent)?.parentFolderId
    ) {
      if (ids.has(parent)) return false;
      seen.add(parent);
    }
    return true;
  });
}

/** Compact folder rows reserve room for each property wrapping onto its own line. */
export function pageCardGeometry(propertyCount: number, hasPreview: boolean) {
  const propertyHeight = propertyCount ? propertyCount * 22 + (propertyCount - 1) * 8 : 0;
  const folderHeight = propertyCount ? 32 + 20 + 12 + propertyHeight : 56;
  // Six preview lines, two title lines, and the same bottom property rows.
  const contentHeight =
    32 + 40 + (hasPreview ? 132 : 0) + (propertyCount ? 12 + propertyHeight : 0);
  const pageRows = Math.max(2, Math.ceil((contentHeight + 16) / (folderHeight + 16)));
  return { folderHeight, pageRows, pageHeight: pageRows * folderHeight + (pageRows - 1) * 16 };
}

/** Accept only page identities from the current environment's live collection. */
export function readPageDragIds(data: string, pages: readonly PageSummary[]): PageId[] {
  const ids: unknown = JSON.parse(data);
  const known = new Set(pages.map((page) => page.id));
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > pages.length ||
    !ids.every((id) => typeof id === "string" && known.has(id as PageId))
  )
    throw new Error("Could not read the dragged pages.");
  return [...new Set(ids)] as PageId[];
}

/** A folder cannot be moved into itself or any descendant selected with it. */
export function pageMoveDestinations(
  pages: readonly PageSummary[],
  selectedIds: ReadonlySet<PageId>,
) {
  const folders = pages.filter((page) => page.kind === "folder");
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  return folders.filter((folder) => {
    const seen = new Set<PageId>();
    for (
      let current: PageSummary | undefined = folder;
      current;
      current = current.parentFolderId ? byId.get(current.parentFolderId) : undefined
    ) {
      if (selectedIds.has(current.id) || seen.has(current.id)) return false;
      seen.add(current.id);
    }
    return true;
  });
}

/** Project-linked folders already supply the project; unlinked folders may contain mixed projects. */
export function pageFolderGrouping(
  grouping: "project" | "type" | "none",
  subgroup: "project" | "type" | "none",
  folderProjectId: ProjectId | null | undefined,
) {
  return grouping === "project" && folderProjectId
    ? { grouping: subgroup, subgroup: "none" as const }
    : { grouping, subgroup };
}

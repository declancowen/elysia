import type { PageSummary, ProjectId } from "@t3tools/contracts";
export function groupPages(
  pages: readonly PageSummary[],
  projects: readonly { readonly id: ProjectId; readonly title: string }[],
  options: {
    readonly search: string;
    readonly groupByProject: boolean;
    readonly sort: "updated" | "created" | "title";
    readonly groupDescending?: boolean;
    readonly hideEmpty?: boolean;
  },
) {
  const search = options.search.trim().toLocaleLowerCase();
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const rows = pages
    .filter((page) => page.title.toLocaleLowerCase().includes(search))
    .toSorted((a, b) =>
      options.sort === "title"
        ? a.title.localeCompare(b.title)
        : options.sort === "created"
          ? b.createdAt.localeCompare(a.createdAt)
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  if (!options.groupByProject) return [{ key: "all", title: "", pages: rows }];
  const groups = new Map<string, { key: string; title: string; pages: PageSummary[] }>();
  if (options.hideEmpty === false) {
    for (const project of projects)
      groups.set(project.id, { key: project.id, title: project.title, pages: [] });
    groups.set("none", { key: "none", title: "No Project", pages: [] });
  }
  for (const page of rows) {
    const project = page.projectId ? projectsById.get(page.projectId) : undefined;
    const key = project?.id ?? "none";
    let group = groups.get(key);
    if (!group) {
      group = { key, title: project?.title ?? "No Project", pages: [] };
      groups.set(key, group);
    }
    group.pages.push(page);
  }
  return Array.from(groups.values()).toSorted((a, b) =>
    a.key === "none"
      ? 1
      : b.key === "none"
        ? -1
        : options.groupDescending
          ? b.title.localeCompare(a.title)
          : a.title.localeCompare(b.title),
  );
}

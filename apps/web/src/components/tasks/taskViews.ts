import type { WorkTaskSummary, WorkTaskSaveInput, WorkTaskStatus } from "@t3tools/contracts";
export const TASK_STATUS_LABELS: Record<WorkTaskStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  done: "Done",
  canceled: "Canceled",
};
export function taskActivity(status: WorkTaskStatus) {
  if (status === "done") return { label: "Completed", description: "has completed this task" };
  if (status === "in_progress") return { label: "Working", description: "is working on this task" };
  return { label: "Waiting", description: "is waiting to work on this task" };
}
export type TaskGrouping = "none" | "status" | "project";
export type TaskView = "list" | "board" | "card";
export type TaskSort = "updated" | "created" | "title";
export interface TaskGroup {
  key: string;
  label: string;
  tasks: WorkTaskSummary[];
  children: TaskGroup[];
  drop: Pick<WorkTaskSaveInput, "status" | "projectId">;
}
export function groupTasks(
  tasks: readonly WorkTaskSummary[],
  grouping: TaskGrouping,
  subGrouping: TaskGrouping,
  projects: readonly { id: WorkTaskSummary["projectId"]; title: string }[],
  hideEmpty: boolean,
): TaskGroup[] {
  if (grouping === "none")
    return [{ key: "all", label: "All tasks", tasks: [...tasks], children: [], drop: {} }];
  const projectIds = new Set(projects.map((project) => project.id));
  const options =
    grouping === "status"
      ? Object.entries(TASK_STATUS_LABELS)
      : [...projects.map((p) => [p.id!, p.title]), ["", "No project"]];
  return options.flatMap(([value, label]) => {
    const members = tasks.filter(
      (task) =>
        (grouping === "status"
          ? task.status
          : projectIds.has(task.projectId)
            ? task.projectId
            : "") === value,
    );
    if (hideEmpty && !members.length) return [];
    return [
      {
        key: `${grouping}:${value}`,
        label: label!,
        tasks: members,
        children:
          subGrouping !== "none" && subGrouping !== grouping
            ? groupTasks(members, subGrouping, "none", projects, hideEmpty)
            : [],
        drop:
          grouping === "status"
            ? { status: value as WorkTaskStatus }
            : { projectId: projects.find((p) => p.id === value)?.id ?? null },
      },
    ];
  });
}
export function visibleTasks(
  tasks: readonly WorkTaskSummary[],
  options: { search: string; status: string; project: string; sort: TaskSort },
) {
  return tasks
    .filter(
      (task) =>
        (!options.search || task.title.toLowerCase().includes(options.search.toLowerCase())) &&
        (!options.status || task.status === options.status) &&
        (!options.project || (task.projectId ?? "none") === options.project),
    )
    .toSorted((a, b) =>
      options.sort === "title"
        ? a.title.localeCompare(b.title)
        : (options.sort === "created"
            ? b.createdAt.localeCompare(a.createdAt)
            : b.updatedAt.localeCompare(a.updatedAt)) || a.id.localeCompare(b.id),
    );
}

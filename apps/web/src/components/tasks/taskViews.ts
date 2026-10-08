import { ComposerContextId } from "@elysiatools/contracts";
import type { WorkTaskSummary, WorkTaskSaveInput, WorkTaskStatus } from "@elysiatools/contracts";
import type { OrchestrationV2ConversationMessage, WorkTaskId } from "@elysiatools/contracts";

import { collectComposerContextReferences } from "@elysiatools/shared/composerContextReferences";

export function isTaskRequest(text: string, id: WorkTaskId) {
  const firstLine = text.split("\n", 1)[0] ?? "";
  if (firstLine.startsWith(`Work on ${id}:`)) return true;
  const [reference] = collectComposerContextReferences(firstLine);
  return (
    firstLine.startsWith("Work on ") &&
    reference?.kind === "task" &&
    reference.contextId === ComposerContextId.make(id) &&
    reference.start === 8 &&
    reference.end === firstLine.length
  );
}

/** Only replies to the most recent task run. Channels resolve their explicit delegation links. */
export function taskResponses(
  messages: readonly Pick<
    OrchestrationV2ConversationMessage,
    "id" | "role" | "text" | "runId" | "streaming"
  >[],
  id: WorkTaskId,
) {
  const start = messages.findLastIndex(
    (message) => message.role === "user" && isTaskRequest(message.text, id),
  );
  if (start < 0) return [];
  const request = messages[start]!;
  if (request.runId === null) return [];
  return messages
    .slice(start + 1)
    .filter((message) => message.role === "assistant" && message.runId === request.runId);
}
export const TASK_STATUS_LABELS: Record<WorkTaskStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  done: "Done",
  canceled: "Canceled",
};
export function taskActivity(status: WorkTaskStatus) {
  if (status === "done") return { label: "Completed", description: "has completed this task" };
  if (status === "in_progress")
    return { label: "In progress", description: "is working on this task" };
  if (status === "canceled") return { label: "Canceled", description: "has canceled this task" };
  return { label: "Waiting", description: "is waiting to work on this task" };
}
export type TaskGrouping = "none" | "status" | "project" | "parent";
export type TaskView = import("../WorkspaceCollectionView").CollectionView;
export type TaskSort = "updated" | "created" | "title";
export interface TaskGroup {
  key: string;
  label: string;
  tasks: WorkTaskSummary[];
  children: TaskGroup[];
  drop: Pick<WorkTaskSaveInput, "status" | "projectId" | "parentTaskId">;
}
export function groupTasks(
  tasks: readonly WorkTaskSummary[],
  grouping: TaskGrouping,
  subGrouping: TaskGrouping,
  projects: readonly { id: WorkTaskSummary["projectId"]; title: string }[],
  hideEmpty: boolean,
  parents: readonly Pick<WorkTaskSummary, "id" | "title">[] = tasks.filter(
    (task) => !task.parentTaskId,
  ),
): TaskGroup[] {
  if (grouping === "none")
    return [{ key: "all", label: "All tasks", tasks: [...tasks], children: [], drop: {} }];
  const projectIds = new Set(projects.map((project) => project.id));
  const parentIds = new Set(parents.map((task) => task.id));
  const options =
    grouping === "status"
      ? Object.entries(TASK_STATUS_LABELS)
      : grouping === "parent"
        ? [...parents.map((task) => [task.id, task.title]), ["", "No Parent"]]
        : [...projects.map((p) => [p.id!, p.title]), ["", "No Project"]];
  return options.flatMap(([value, label]) => {
    const members = tasks.filter(
      (task) =>
        (grouping === "status"
          ? task.status
          : grouping === "parent"
            ? task.parentTaskId && parentIds.has(task.parentTaskId)
              ? task.parentTaskId
              : ""
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
            ? groupTasks(members, subGrouping, "none", projects, hideEmpty, parents)
            : [],
        drop:
          grouping === "status"
            ? { status: value as WorkTaskStatus }
            : grouping === "parent"
              ? { parentTaskId: parents.find((task) => task.id === value)?.id ?? null }
              : { projectId: projects.find((p) => p.id === value)?.id ?? null },
      },
    ];
  });
}
/** Display preferences cannot repeat metadata already represented by a group. */
export function taskVisibleProperties(
  properties: readonly import("../WorkspaceCollectionView").CollectionProperty[],
  group: TaskGroup["drop"],
) {
  return properties.filter((property) =>
    property === "status"
      ? group.status === undefined
      : property === "project"
        ? group.projectId === undefined
        : property === "parent"
          ? group.parentTaskId === undefined
          : true,
  );
}

/** Metadata already expressed by either group level is hidden for every descendant. */
export function taskMetadata(
  task: WorkTaskSummary,
  group: TaskGroup["drop"],
  projects: readonly { id: WorkTaskSummary["projectId"]; title: string }[],
  parents: readonly Pick<WorkTaskSummary, "id" | "title">[],
) {
  return {
    status: group.status === undefined ? TASK_STATUS_LABELS[task.status] : null,
    project:
      group.projectId === undefined
        ? (projects.find((project) => project.id === task.projectId)?.title ?? "No Project")
        : null,
    parent:
      group.parentTaskId === undefined && task.parentTaskId
        ? (parents.find((parent) => parent.id === task.parentTaskId)?.title ?? "No Parent")
        : null,
  };
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

import { expect, it } from "vite-plus/test";
import {
  ComposerContextId,
  MessageId,
  RunId,
  ProjectId,
  WorkTaskId,
  type WorkTaskSummary,
} from "@t3tools/contracts";
import { formatComposerContextReference } from "@t3tools/shared/composerContextReferences";
import {
  groupTasks,
  taskMetadata,
  taskVisibleProperties,
  visibleTasks,
  taskActivity,
  taskResponses,
  isTaskRequest,
} from "./taskViews";
const task = (
  id: string,
  projectId: WorkTaskSummary["projectId"],
  status: WorkTaskSummary["status"],
): WorkTaskSummary => ({
  id: WorkTaskId.make(id),
  title: id,
  revision: 1,
  descriptionPreview: "",
  status,
  projectId,
  assigneeProjectId: null,
  parentTaskId: null,
  createdAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
  completedAt: null,
  startedThreadId: null,
  startError: null,
});
it("describes the assigned worker consistently in task content and properties", () => {
  expect(taskActivity("in_progress")).toEqual({
    label: "In progress",
    description: "is working on this task",
  });
  expect(taskActivity("done")).toEqual({
    label: "Completed",
    description: "has completed this task",
  });
  expect(taskActivity("canceled")).toEqual({
    label: "Canceled",
    description: "has canceled this task",
  });
  for (const status of ["todo", "backlog"] as const)
    expect(taskActivity(status)).toEqual({
      label: "Waiting",
      description: "is waiting to work on this task",
    });
});
it("keeps unlinked and deleted-project tasks visible, groups statuses within projects and filters", () => {
  const projectId = ProjectId.make("project-a");
  const tasks = [
    task("TASK-1", projectId, "todo"),
    task("TASK-2", null, "done"),
    task("TASK-3", ProjectId.make("deleted"), "todo"),
  ];
  const groups = groupTasks(tasks, "project", "status", [{ id: projectId, title: "Work" }], true);
  expect(groups.map((g) => g.label)).toEqual(["Work", "No Project"]);
  expect(groups[1]?.tasks.map((t) => t.id)).toEqual(["TASK-2", "TASK-3"]);
  expect(groups[0]?.children[0]?.drop).toEqual({ status: "todo" });
  expect(groupTasks(tasks, "status", "none", [], false)).toHaveLength(5);
  expect(
    visibleTasks(tasks, { search: "task", status: "todo", project: "", sort: "title" }).map(
      (t) => t.id,
    ),
  ).toEqual(["TASK-1", "TASK-3"]);
});

it("places subtasks in their own status and parent groups without duplicating them", () => {
  const parent = task("TASK-1", null, "todo");
  const child = { ...task("TASK-2", null, "done"), parentTaskId: parent.id };
  const tasks = [parent, child];
  const groups = groupTasks(tasks, "parent", "status", [], true);
  expect(groups.map((group) => [group.label, group.tasks.map((task) => task.id)])).toEqual([
    [parent.title, [child.id]],
    ["No Parent", [parent.id]],
  ]);
  expect(groups[0]?.drop).toEqual({ parentTaskId: parent.id });
  expect(groups[0]?.children[0]?.drop).toEqual({ status: "done" });
  expect(groups[1]?.drop).toEqual({ parentTaskId: null });
  expect(groupTasks(tasks, "status", "none", [], true).map((group) => group.tasks)).toEqual([
    [parent],
    [child],
  ]);
});

it("keeps task status separate from agent activity and hides metadata supplied by any group level", () => {
  const projectId = ProjectId.make("project-a");
  const projects = [{ id: projectId, title: "Work" }];
  const parent = task("TASK-1", projectId, "todo");
  const child = { ...task("TASK-2", projectId, "done"), parentTaskId: parent.id };
  expect(taskMetadata(child, {}, projects, [parent])).toEqual({
    status: "Done",
    project: "Work",
    parent: parent.title,
  });
  expect(taskActivity(child.status).label).toBe("Completed");
  const groups = groupTasks([child], "project", "status", projects, true, [parent]);
  expect(
    taskMetadata(child, { ...groups[0]?.drop, ...groups[0]?.children[0]?.drop }, projects, [
      parent,
    ]),
  ).toEqual({ status: null, project: null, parent: parent.title });
  const parentGroups = groupTasks([child], "parent", "status", projects, true, [parent]);
  expect(
    taskMetadata(
      child,
      { ...parentGroups[0]?.drop, ...parentGroups[0]?.children[0]?.drop },
      projects,
      [parent],
    ),
  ).toEqual({ status: null, project: "Work", parent: null });
  expect(taskMetadata(task("TASK-3", null, "todo"), {}, [], [])).toEqual({
    status: "Todo",
    project: "No Project",
    parent: null,
  });
  expect(
    taskMetadata(parent, { status: "todo", projectId: null, parentTaskId: null }, [], []),
  ).toEqual({ status: null, project: null, parent: null });
});

it("shows only responses to the latest task run and leaves channel resolution to its delegation links", () => {
  const message = (
    id: string,
    role: "user" | "assistant",
    text: string,
    runId: string | null = null,
  ) => ({
    id: MessageId.make(id),
    role,
    text,
    runId: runId === null ? null : RunId.make(runId),
    streaming: false,
  });
  const messages = [
    message("old-task", "user", "Work on TASK-1: Old", "old"),
    message("old-reply", "assistant", "Old result", "old"),
    message(
      "task",
      "user",
      `Work on ${formatComposerContextReference({ kind: "task", contextId: ComposerContextId.make("TASK-1"), label: "New" })}\n\nDescription`,
      "new",
    ),
    message("other", "user", "Work on TASK-2: Different", "other"),
    message("other-reply", "assistant", "Wrong result", "other"),
    message("reply", "assistant", "Correct result", "new"),
  ];
  expect(taskResponses(messages, WorkTaskId.make("TASK-1")).map((m) => m.text)).toEqual([
    "Correct result",
  ]);
  expect(
    taskResponses(
      messages.map((m) => ({ ...m, runId: null })),
      WorkTaskId.make("TASK-1"),
    ),
  ).toEqual([]);
  expect(taskResponses(messages, WorkTaskId.make("TASK-9"))).toEqual([]);
});

it("matches linked task requests by identity, not title or links in the description", () => {
  const id = WorkTaskId.make("TASK-1");
  const link = formatComposerContextReference({
    kind: "task",
    contextId: ComposerContextId.make(id),
    label: "New",
  });
  expect(isTaskRequest(`Work on ${link}\n\nDetails`, id)).toBe(true);
  expect(isTaskRequest(`Work on ${link}`, WorkTaskId.make("TASK-2"))).toBe(false);
  expect(isTaskRequest(`Discuss this task\n${link}`, id)).toBe(false);
  expect(isTaskRequest(`Work on ${link} sometime`, id)).toBe(false);
  expect(isTaskRequest("Work on TASK-1: Historical", id)).toBe(true);
});

it("keeps selected properties when grouping is off and suppresses both active group levels", () => {
  const properties = ["status", "project", "parent", "createdAt", "updatedAt"] as const;
  const noGrouping = groupTasks([], "none", "status", [], true)[0]!;
  expect(taskVisibleProperties(properties, noGrouping.drop)).toEqual(properties);
  expect(taskVisibleProperties(properties, { status: "todo", projectId: null })).toEqual([
    "parent",
    "createdAt",
    "updatedAt",
  ]);
  expect(taskVisibleProperties(properties, { parentTaskId: null })).toEqual([
    "status",
    "project",
    "createdAt",
    "updatedAt",
  ]);
});

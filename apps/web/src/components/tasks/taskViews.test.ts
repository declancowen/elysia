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
import { groupTasks, visibleTasks, taskActivity, taskResponses, isTaskRequest } from "./taskViews";
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
    label: "Working",
    description: "is working on this task",
  });
  expect(taskActivity("done")).toEqual({
    label: "Completed",
    description: "has completed this task",
  });
  for (const status of ["todo", "backlog", "canceled"] as const)
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
  expect(groups.map((g) => g.label)).toEqual(["Work", "No project"]);
  expect(groups[1]?.tasks.map((t) => t.id)).toEqual(["TASK-2", "TASK-3"]);
  expect(groups[0]?.children[0]?.drop).toEqual({ status: "todo" });
  expect(groupTasks(tasks, "status", "none", [], false)).toHaveLength(5);
  expect(
    visibleTasks(tasks, { search: "task", status: "todo", project: "", sort: "title" }).map(
      (t) => t.id,
    ),
  ).toEqual(["TASK-1", "TASK-3"]);
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

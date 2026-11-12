import type { WorkTask } from "@elysiatools/contracts";

type TaskDraft = Pick<WorkTask, "title" | "description">;

export function reconcileTaskSave(current: TaskDraft, submitted: TaskDraft, saved: TaskDraft) {
  return {
    title: current.title === submitted.title ? saved.title : current.title,
    description:
      current.description === submitted.description ? saved.description : current.description,
  };
}

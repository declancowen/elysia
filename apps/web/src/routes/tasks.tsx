import { createFileRoute, redirect } from "@tanstack/react-router";
import { WorkTaskId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { TasksPage } from "../components/tasks/TasksPage";
const isTaskId = Schema.is(WorkTaskId);
export const Route = createFileRoute("/tasks")({
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    )
      throw redirect({ to: "/pair", replace: true });
  },
  validateSearch: (search: Record<string, unknown>): { task?: WorkTaskId; create?: boolean } => ({
    ...(isTaskId(search.task) ? { task: search.task } : {}),
    ...(search.create === true ? { create: true } : {}),
  }),
  component: TasksPage,
});

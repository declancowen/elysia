import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as TaskService from "../../../tasks/TaskService.ts";
import { readCaller, readMutationCaller } from "../../threadAccess.ts";
import { TaskToolkit } from "./tools.ts";
const read = Effect.gen(function* () {
  yield* readCaller();
  return yield* TaskService.TaskService;
});
const mutation = Effect.gen(function* () {
  const { caller } = yield* readMutationCaller();
  if (caller.runtimeMode !== "full-access" || caller.interactionMode !== "default")
    return yield* new OrchestratorMcpFailure({
      code: "capability_denied",
      message: "Task changes require full access.",
    });
  return yield* TaskService.TaskService;
});
const mapFailure = (error: { message: string }) =>
  new OrchestratorMcpFailure({ code: "invalid_request", message: error.message });
export const TaskHandlersLive = TaskToolkit.toLayer({
  t3_task_list: () =>
    read.pipe(Effect.flatMap((service) => service.list().pipe(Effect.mapError(mapFailure)))),
  t3_task_read: (input) =>
    read.pipe(Effect.flatMap((service) => service.get(input).pipe(Effect.mapError(mapFailure)))),
  t3_task_create: (input) =>
    mutation.pipe(
      Effect.flatMap((service) => service.save(input).pipe(Effect.mapError(mapFailure))),
    ),
  t3_task_delete: (input) =>
    mutation.pipe(
      Effect.flatMap((service) => service.delete(input).pipe(Effect.mapError(mapFailure))),
    ),
  t3_task_update: (input) =>
    mutation.pipe(
      Effect.flatMap((service) => service.save(input).pipe(Effect.mapError(mapFailure))),
    ),
});

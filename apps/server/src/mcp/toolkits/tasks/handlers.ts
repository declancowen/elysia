import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as TaskService from "../../../tasks/TaskService.ts";
import { readCaller } from "../../threadAccess.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { TaskToolkit } from "./tools.ts";
const read = Effect.gen(function* () {
  yield* readCaller();
  return yield* TaskService.TaskService;
});

const mapFailure = (error: { message: string }) =>
  new OrchestratorMcpFailure({ code: "invalid_request", message: error.message });
export const layer = McpToolAccess.toLayer(TaskToolkit, {
  elysia_task_list: McpToolAccess.reads(() =>
    read.pipe(Effect.flatMap((service) => service.list().pipe(Effect.mapError(mapFailure)))),
  ),
  elysia_task_read: McpToolAccess.reads((input) =>
    read.pipe(Effect.flatMap((service) => service.get(input).pipe(Effect.mapError(mapFailure)))),
  ),
  elysia_task_create: McpToolAccess.writesEnvironment((input) =>
    TaskService.TaskService.pipe(
      Effect.flatMap((service) => service.save(input).pipe(Effect.mapError(mapFailure))),
    ),
  ),
  elysia_task_delete: McpToolAccess.writesEnvironment((input) =>
    TaskService.TaskService.pipe(
      Effect.flatMap((service) => service.delete(input).pipe(Effect.mapError(mapFailure))),
    ),
  ),
  elysia_task_update: McpToolAccess.writesEnvironment((input) =>
    TaskService.TaskService.pipe(
      Effect.flatMap((service) => service.save(input).pipe(Effect.mapError(mapFailure))),
    ),
  ),
});

import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  WorkTaskId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as Tasks from "../../../tasks/TaskService.ts";
import * as Threads from "../../../orchestration-v2/ThreadManagementService.ts";
import * as Invocation from "../../McpInvocationContext.ts";
import { TaskHandlersLive } from "./handlers.ts";
import { TaskToolkit } from "./tools.ts";
it.effect("does not let a read-only agent mutate a task", () =>
  Effect.gen(function* () {
    const threadId = ThreadId.make("task-tool-caller");
    const instanceId = ProviderInstanceId.make("elysia");
    const caller = {
      id: threadId,
      projectId: ProjectId.make("task-tool-project"),
      providerInstanceId: instanceId,
      activeRunId: RunId.make("task-tool-run"),
      archivedAt: null,
      deletedAt: null,
      runtimeMode: "read-only",
      interactionMode: "default",
    } as unknown as OrchestrationV2ThreadShell;
    const dependencies = Layer.mergeAll(
      Layer.succeed(Invocation.McpInvocationContext, {
        environmentId: EnvironmentId.make("task-tool-environment"),
        threadId,
        providerInstanceId: instanceId,
        providerSessionId: "task-tool-session",
        issuedAt: 0,
        capabilities: new Set(["orchestration" as const]),
      }),
      Layer.mock(Threads.ThreadManagementService)({ getThreadShell: () => Effect.succeed(caller) }),
      Layer.mock(Tasks.TaskService)({
        save: () => Effect.die("A read-only tool must not call task save."),
        delete: () => Effect.die("A read-only tool must not delete tasks."),
      }),
    );
    const toolkit = yield* TaskToolkit.pipe(
      Effect.provide(TaskHandlersLive.pipe(Layer.provide(dependencies))),
    );
    const results = yield* toolkit
      .handle("elysia_task_create", { title: "Forbidden edit" })
      .pipe(Stream.unwrap, Stream.runCollect, Effect.provide(dependencies));
    expect(results.at(-1)?.result).toMatchObject({
      _tag: "OrchestratorMcpFailure",
      code: "capability_denied",
    });
    const deletion = yield* toolkit
      .handle("elysia_task_delete", { id: WorkTaskId.make("TASK-1") })
      .pipe(Stream.unwrap, Stream.runCollect, Effect.provide(dependencies));
    expect(deletion.at(-1)?.result).toMatchObject({
      _tag: "OrchestratorMcpFailure",
      code: "capability_denied",
    });
  }),
);

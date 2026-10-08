import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  PageId,
  type OrchestrationV2ThreadShell,
} from "@elysiatools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as Pages from "../../../pages/PageService.ts";
import * as Threads from "../../../orchestration-v2/ThreadManagementService.ts";
import * as Invocation from "../../McpInvocationContext.ts";
import * as Handlers from "./handlers.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { PagesToolkit } from "./tools.ts";
it.effect("does not let a read-only agent mutate a page", () =>
  Effect.gen(function* () {
    const threadId = ThreadId.make("page-tool-caller");
    const instanceId = ProviderInstanceId.make("elysia");
    const caller = {
      id: threadId,
      projectId: ProjectId.make("page-tool-project"),
      providerInstanceId: instanceId,
      activeRunId: RunId.make("page-tool-run"),
      archivedAt: null,
      deletedAt: null,
      runtimeMode: "read-only",
      interactionMode: "default",
    } as unknown as OrchestrationV2ThreadShell;
    const dependencies = Layer.mergeAll(
      Layer.succeed(Invocation.McpInvocationContext, {
        environmentId: EnvironmentId.make("page-tool-environment"),
        requestNamespace: "pages-tool-session",
        client: undefined,
        thread: {
          threadId,
          providerInstanceId: instanceId,
          providerSessionId: "page-tool-session",
        },
        issuedAt: 0,
        capabilities: new Set(["orchestration" as const]),
      }),
      Layer.mock(Threads.ThreadManagementService)({ getThreadShell: () => Effect.succeed(caller) }),
      Layer.mock(Pages.PageService)({
        save: () => Effect.die("A read-only tool must not call page save."),
        delete: () => Effect.die("A read-only tool must not delete pages."),
      }),
    );
    const toolkit = yield* PagesToolkit.pipe(
      Effect.provide(
        McpToolAccess.HandlersLayer.layer(Handlers.layer).pipe(Layer.provide(dependencies)),
      ),
    );
    const results = yield* toolkit
      .handle("elysia_page_create", { title: "Forbidden edit" })
      .pipe(Stream.unwrap, Stream.runCollect, Effect.provide(dependencies));
    expect(results.at(-1)?.result).toMatchObject({
      _tag: "OrchestratorMcpFailure",
      code: "capability_denied",
    });
    const deletion = yield* toolkit
      .handle("elysia_page_delete", {
        id: PageId.make("page-00000000-0000-4000-8000-000000000001"),
      })
      .pipe(Stream.unwrap, Stream.runCollect, Effect.provide(dependencies));
    expect(deletion.at(-1)?.result).toMatchObject({
      _tag: "OrchestratorMcpFailure",
      code: "capability_denied",
    });
  }),
);

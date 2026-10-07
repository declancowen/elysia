import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { OrchestratorProjectionError } from "../orchestration-v2/Orchestrator.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import type * as McpInvocationContext from "./McpInvocationContext.ts";
import { liveThreadShell } from "./McpToolAccess.testkit.ts";
import * as ThreadMetadataMcp from "./ThreadMetadataMcpService.ts";

const threadId = ThreadId.make("thread:metadata-caller");
const scope: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment:metadata-test"),
  requestNamespace: "provider-session:metadata-test",
  thread: {
    threadId,
    providerSessionId: "provider-session:metadata-test",
    providerInstanceId: ProviderInstanceId.make("codex"),
  },
  client: undefined,
  capabilities: new Set(["orchestration"]),
  issuedAt: 1,
};

function layerService(
  getThreadShell: ThreadManagement.ThreadManagementService["Service"]["getThreadShell"],
) {
  return ThreadMetadataMcp.layer.pipe(
    Layer.provide(
      Layer.merge(
        Layer.mock(ThreadManagement.ThreadManagementService)({
          getThreadShell,
          getThreadRecords: () => Effect.die("projection must not load after shell failure"),
        } satisfies Partial<ThreadManagement.ThreadManagementService["Service"]>),
        NodeCrypto.layer,
      ),
    ),
  );
}

const updateCallingThread = Effect.gen(function* () {
  const service = yield* ThreadMetadataMcp.ThreadMetadataMcpService;
  return yield* service.update(scope, {
    action: "rename",
    title: "Renamed thread",
    clientRequestId: "metadata-caller-classification",
  });
});

it.effect("reports an absent calling thread as thread_not_found", () =>
  Effect.gen(function* () {
    const error = yield* updateCallingThread.pipe(
      Effect.provide(layerService(() => Effect.succeed(null))),
      Effect.flip,
    );

    expect(error.code).toBe("thread_not_found");
  }),
);

it.effect("keeps calling-thread storage failures as orchestration errors", () =>
  Effect.gen(function* () {
    const error = yield* updateCallingThread.pipe(
      Effect.provide(
        layerService(() =>
          Effect.fail(
            new OrchestratorProjectionError({
              threadId,
              cause: new Error("storage unavailable"),
            }),
          ),
        ),
      ),
      Effect.flip,
    );

    expect(error.code).toBe("orchestration_error");
  }),
);

it.effect(
  "rejects metadata changes outside the calling project before loading or dispatching",
  () =>
    Effect.gen(function* () {
      const targetId = ThreadId.make("thread:foreign-project");
      const serviceLayer = ThreadMetadataMcp.layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            NodeCrypto.layer,
            Layer.mock(ThreadManagement.ThreadManagementService)({
              getThreadShell: (id) =>
                Effect.succeed({
                  ...liveThreadShell(id),
                  projectId: ProjectId.make(id === threadId ? "project:caller" : "project:foreign"),
                }),
              getProjectThreadRecords: () => Effect.die("foreign projection must not load"),
              dispatch: () => Effect.die("foreign metadata must not change"),
            }),
          ),
        ),
      );
      const error = yield* Effect.gen(function* () {
        const service = yield* ThreadMetadataMcp.ThreadMetadataMcpService;
        return yield* service.update(scope, {
          threadId: targetId,
          action: "rename",
          title: "Forbidden",
        });
      }).pipe(Effect.provide(serviceLayer), Effect.flip);
      expect(error.code).toBe("thread_not_found");
    }),
);

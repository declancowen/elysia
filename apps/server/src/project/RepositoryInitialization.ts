import type { ThreadId, ProviderInstanceId } from "@elysiatools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { normalizeProjectPathForComparison } from "@elysiatools/shared/path";
import { ServerConfig } from "../config.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as VcsProvisioningService from "../vcs/VcsProvisioningService.ts";
import * as VcsStatusBroadcaster from "../vcs/VcsStatusBroadcaster.ts";

export class RepositoryInitializationDeniedError extends Schema.TaggedError<RepositoryInitializationDeniedError>()(
  "RepositoryInitializationDeniedError",
  { detail: Schema.String },
) {
  override get message(): string {
    return this.detail;
  }
}

export class RepositoryInitializationFailedError extends Schema.TaggedError<RepositoryInitializationFailedError>()(
  "RepositoryInitializationFailedError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Could not initialize Git in this chat's workspace.";
  }
}

export class RepositoryInitialization extends Context.Service<
  RepositoryInitialization,
  {
    readonly initialize: (input: {
      readonly threadId: ThreadId;
      readonly providerInstanceId: ProviderInstanceId;
      readonly providerSessionId: string;
    }) => Effect.Effect<
      { cwd: string },
      RepositoryInitializationDeniedError | RepositoryInitializationFailedError
    >;
  }
>()("@elysiatools/server/project/RepositoryInitialization") {}

const make = Effect.gen(function* () {
  const snapshots = yield* ProjectionStore.ProjectionStoreV2;
  const projects = yield* ProjectStore.ProjectStoreV2;
  const provisioning = yield* VcsProvisioningService.VcsProvisioningService;
  const status = yield* VcsStatusBroadcaster.VcsStatusBroadcaster;
  const config = yield* ServerConfig;
  const path = yield* Path.Path;
  return RepositoryInitialization.of({
    initialize: Effect.fn("RepositoryInitialization.initialize")(function* (input) {
      const records = yield* snapshots.getThreadRecords(input.threadId, ["providerSessions"]).pipe(
        Effect.mapError((cause) =>
          cause._tag === "ProjectionStoreThreadNotFoundError"
            ? new RepositoryInitializationDeniedError({
                detail: "This chat is missing. Open an active chat before initializing Git.",
              })
            : new RepositoryInitializationFailedError({ cause }),
        ),
      );
      const thread = records.thread;
      if (thread === null || thread.archivedAt !== null || thread.deletedAt !== null) {
        return yield* new RepositoryInitializationDeniedError({
          detail: "This chat is missing or archived. Open an active chat before initializing Git.",
        });
      }
      if (thread.interactionMode === "plan") {
        return yield* new RepositoryInitializationDeniedError({
          detail:
            "Git initialization changes the workspace. Leave plan mode before initializing Git.",
        });
      }
      const session = records.providerSessions.find(
        (candidate) => candidate.id === input.providerSessionId,
      );
      if (
        !session ||
        session.status === "stopped" ||
        session.status === "error" ||
        session.providerInstanceId !== input.providerInstanceId
      ) {
        return yield* new RepositoryInitializationDeniedError({
          detail:
            "This agent session is no longer active. Send a new message before initializing Git.",
        });
      }
      const project = yield* projects
        .get(thread.projectId)
        .pipe(Effect.mapError((cause) => new RepositoryInitializationFailedError({ cause })));
      if (Option.isNone(project)) {
        return yield* new RepositoryInitializationDeniedError({
          detail:
            "This project workspace is missing. Open an active project before initializing Git.",
        });
      }

      if (
        project.value.agentProfile != null ||
        normalizeProjectPathForComparison(path.resolve(project.value.workspaceRoot)) ===
          normalizeProjectPathForComparison(path.resolve(config.baseDir, "scratch"))
      ) {
        return yield* new RepositoryInitializationDeniedError({
          detail:
            "Git initialization is available only in projects. Projectless chats and agents do not use Git.",
        });
      }

      const cwd = thread.worktreePath ?? project.value.workspaceRoot;
      yield* provisioning
        .initRepository({ cwd, kind: "git" })
        .pipe(Effect.mapError((cause) => new RepositoryInitializationFailedError({ cause })));
      // Match the app action: publish refreshed status without delaying a successful init.
      yield* status
        .refreshStatus(cwd)
        .pipe(Effect.ignoreCause({ log: true }), Effect.forkDetach, Effect.asVoid);
      return { cwd };
    }),
  });
});
export const layer = Layer.effect(RepositoryInitialization, make);

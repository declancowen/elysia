import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { normalizeProjectPathForComparison } from "@t3tools/shared/path";

import { ServerConfig } from "../../../config.ts";
import * as ProjectionSnapshotQuery from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as VcsProvisioningService from "../../../vcs/VcsProvisioningService.ts";
import * as VcsStatusBroadcaster from "../../../vcs/VcsStatusBroadcaster.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import {
  RepositoryInitializationDeniedError,
  RepositoryInitializationFailedError,
  RepositoryToolkit,
} from "./tools.ts";

const make = Effect.gen(function* () {
  const snapshots = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
  const provisioning = yield* VcsProvisioningService.VcsProvisioningService;
  const status = yield* VcsStatusBroadcaster.VcsStatusBroadcaster;
  const config = yield* ServerConfig;
  const path = yield* Path.Path;

  return RepositoryToolkit.of({
    initialize_git: Effect.fn("RepositoryToolkit.initializeGit")(function* () {
      const scope = yield* McpInvocationContext.requireMcpCapability("repository");
      const thread = yield* snapshots
        .getThreadShellById(scope.threadId)
        .pipe(Effect.mapError((cause) => new RepositoryInitializationFailedError({ cause })));
      if (Option.isNone(thread) || thread.value.archivedAt !== null) {
        return yield* new RepositoryInitializationDeniedError({
          detail: "This chat is missing or archived. Open an active chat before initializing Git.",
        });
      }
      if (thread.value.interactionMode === "plan") {
        return yield* new RepositoryInitializationDeniedError({
          detail:
            "Git initialization changes the workspace. Leave plan mode before initializing Git.",
        });
      }
      const session = thread.value.session;
      if (
        !session ||
        session.status === "stopped" ||
        session.status === "interrupted" ||
        session.status === "error" ||
        (session.providerInstanceId ?? thread.value.modelSelection.instanceId) !==
          scope.providerInstanceId
      ) {
        return yield* new RepositoryInitializationDeniedError({
          detail:
            "This agent session is no longer active. Send a new message before initializing Git.",
        });
      }
      const project = yield* snapshots
        .getProjectShellById(thread.value.projectId)
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

      const cwd = thread.value.worktreePath ?? project.value.workspaceRoot;
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

export const RepositoryToolkitHandlersLive = RepositoryToolkit.toLayer(make);

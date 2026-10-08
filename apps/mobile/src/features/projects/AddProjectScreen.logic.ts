import { canCreateProjectInEnvironment } from "@elysiatools/client-runtime/operations/projects";
import type { EnvironmentConnectionPhase } from "@elysiatools/client-runtime/connection";
import type { EnvironmentId } from "@elysiatools/contracts";

export function resolveAddProjectEnvironment<
  T extends {
    readonly environmentId: EnvironmentId;
    readonly connectionState: EnvironmentConnectionPhase;
  },
>(environmentOptions: ReadonlyArray<T>, requestedEnvironmentId: EnvironmentId | null): T | null {
  if (requestedEnvironmentId !== null) {
    return (
      environmentOptions.find(
        (environment) =>
          environment.environmentId === requestedEnvironmentId &&
          canCreateProjectInEnvironment(environment.connectionState),
      ) ?? null
    );
  }

  return (
    environmentOptions.find((environment) =>
      canCreateProjectInEnvironment(environment.connectionState),
    ) ?? null
  );
}
